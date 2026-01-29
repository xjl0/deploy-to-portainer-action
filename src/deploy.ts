import { PortainerApi } from './api'
import path from 'path'
import fs from 'fs'
import Handlebars from 'handlebars'
import * as core from '@actions/core'

type DeployStack = {
  portainerHost: string
  apiKey: string
  endpointId: number
  stackName: string
  stackDefinitionFile: string
  templateVariables?: object
  image?: string
  prune?: boolean
  pullImage?: boolean
}

function generateNewStackDefinition(
  stackDefinitionFile: string,
  templateVariables?: object,
  image?: string
): string {
  const stackDefFilePath = path.join(process.env.GITHUB_WORKSPACE as string, stackDefinitionFile)
  core.info(`Чтение файла стека из ${stackDefFilePath}`)
  let stackDefinition = fs.readFileSync(stackDefFilePath, 'utf8')
  if (!stackDefinition) {
    throw new Error(`Не удалось найти файл стека: ${stackDefFilePath}`)
  }

  if (templateVariables) {
    core.info(`Применение переменных шаблона для ключей: ${Object.keys(templateVariables)}`)
    stackDefinition = Handlebars.compile(stackDefinition)(templateVariables)
  }

  if (!image) {
    core.info(`Новый образ не указан. Будет использован образ из файла стека.`)
    return stackDefinition
  }

  const imageWithoutTag = image.substring(0, image.indexOf(':'))
  core.info(`Вставка образа ${image} в определение стека`)
  
  // Экранируем специальные символы regex в имени образа
  const escapedImageWithoutTag = imageWithoutTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  
  // Поддерживаем оба формата: с кавычками и без
  // Формат 1: image: "repo:tag" или image: 'repo:tag'
  // Формат 2: image: repo:tag
  const imageRegex = new RegExp(
    `(image:\\s*["']?)${escapedImageWithoutTag}(?::[^"'\\s\\n]*)?(["']?)`,
    'g'
  )
  
  return stackDefinition.replace(imageRegex, (match, prefix, suffix) => {
    return `${prefix}${image}${suffix}`
  })
}

export async function deployStack({
  portainerHost,
  apiKey,
  endpointId,
  stackName,
  stackDefinitionFile,
  templateVariables,
  image,
  prune,
  pullImage
}: DeployStack): Promise<void> {
  const portainerApi = new PortainerApi(portainerHost, apiKey)

  const stackDefinitionToDeploy = generateNewStackDefinition(
    stackDefinitionFile,
    templateVariables,
    image
  )
  core.debug(stackDefinitionToDeploy)

  try {
    const allStacks = await portainerApi.getStacks()
    const existingStack = allStacks.find(s => s.Name === stackName)

    if (!existingStack) {
      throw new Error(`Стек с именем "${stackName}" не найден. Пожалуйста, сначала создайте стек вручную в Portainer.`)
    }

    core.info(`Найден существующий стек с именем: ${stackName}`)
    core.info(
      `Обновление стека... Id: ${existingStack.Id} EndpointId: ${existingStack.EndpointId}`
    )
    core.info(`Параметры обновления: prune=${prune || false}, pullImage=${pullImage || false}`)
    await portainerApi.updateStack(
      existingStack.Id,
      {
        endpointId: existingStack.EndpointId
      },
      {
        env: existingStack.Env,
        stackFileContent: stackDefinitionToDeploy,
        prune: prune || false,
        pullImage: pullImage || false
      }
    )
    core.info('Стек успешно обновлен')
  } catch (error) {
    core.info('⛔️ Ошибка при развертывании!')
    throw error
  }
}
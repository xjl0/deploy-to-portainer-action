import { PortainerApi } from './api'
import path from 'path'
import fs from 'fs'
import Handlebars from 'handlebars'
import * as core from '@actions/core'

type DeployStack = {
  portainerHost: string
  apiKey: string
  endpointId: number
  stackName?: string
  stackId?: number
  useExistingStack?: boolean
  stackDefinitionFile?: string
  templateVariables?: object
  image?: string
  prune?: boolean
  pullImage?: boolean
}

function applyImageReplacement(stackDefinition: string, image: string): string {
  const imageWithoutTag = image.substring(0, image.indexOf(':'))
  core.info(`Вставка образа ${image} в определение стека`)

  const escapedImageWithoutTag = imageWithoutTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const imageRegex = new RegExp(
    `(image:\\s*["']?)${escapedImageWithoutTag}(?::[^"'\\s\\n]*)?(["']?)`,
    'g'
  )

  return stackDefinition.replace(imageRegex, (match, prefix, suffix) => {
    return `${prefix}${image}${suffix}`
  })
}

function prepareStackDefinition(
  stackContent: string,
  templateVariables?: object,
  image?: string
): string {
  let result = stackContent

  if (templateVariables) {
    core.info(`Применение переменных шаблона для ключей: ${Object.keys(templateVariables)}`)
    result = Handlebars.compile(result)(templateVariables)
  }

  if (!image) {
    core.info(`Новый образ не указан. Будет использован образ из определения стека.`)
    return result
  }

  return applyImageReplacement(result, image)
}

export async function deployStack({
  portainerHost,
  apiKey,
  endpointId,
  stackName,
  stackId,
  useExistingStack,
  stackDefinitionFile,
  templateVariables,
  image,
  prune,
  pullImage
}: DeployStack): Promise<void> {
  if (!useExistingStack && (!stackDefinitionFile || !stackDefinitionFile.trim())) {
    throw new Error(
      'При use-existing-stack=false необходимо указать stack-definition (путь к docker-compose файлу)'
    )
  }

  const portainerApi = new PortainerApi(portainerHost, apiKey)

  try {
    let existingStack

    // Если указан ID - получаем стек напрямую (быстрее)
    if (stackId) {
      core.info(`Получение стека по ID: ${stackId}`)
      try {
        existingStack = await portainerApi.getStack(stackId)
        core.info(`Найден стек: ${existingStack.Name} (ID: ${existingStack.Id})`)
        core.info(`  EndpointId стека: ${existingStack.EndpointId}`)
        core.info(`  Ожидаемый EndpointId: ${endpointId}`)
        
        // Проверяем соответствие endpoint
        if (existingStack.EndpointId !== endpointId) {
          core.warning(`⚠️  Стек ${stackId} принадлежит endpoint ${existingStack.EndpointId}, а указан endpoint ${endpointId}`)
        }
      } catch (error: any) {
        if (error.response?.status === 404) {
          core.warning(`⚠️  Стек с ID ${stackId} не найден`)
          
          // Попытка найти по имени если указан
          if (stackName) {
            core.info(`Попытка найти стек по имени: ${stackName}`)
            const allStacks = await portainerApi.getStacks()
            const stacksForEndpoint = allStacks.filter(s => s.EndpointId === endpointId)
            
            core.info(`Найдено стеков для endpoint ${endpointId}: ${stacksForEndpoint.length}`)
            stacksForEndpoint.forEach(s => {
              core.info(`  - ${s.Name} (ID: ${s.Id})`)
            })
            
            existingStack = stacksForEndpoint.find(s => s.Name === stackName)
            if (existingStack) {
              core.info(`✅ Найден стек по имени: ${stackName} (ID: ${existingStack.Id})`)
              core.warning(`💡 Обновите секрет STACK_ID на ${existingStack.Id} для ускорения`)
            } else {
              throw new Error(
                `Стек "${stackName}" не найден в endpoint ${endpointId}.\n` +
                `Доступные стеки: ${stacksForEndpoint.map(s => s.Name).join(', ') || 'нет'}`
              )
            }
          } else {
            // Покажем все доступные стеки для диагностики
            core.info('📋 Получение списка всех стеков для диагностики...')
            try {
              const allStacks = await portainerApi.getStacks()
              const stacksForEndpoint = allStacks.filter(s => s.EndpointId === endpointId)
              
              core.info(`\n🔍 Найдено стеков для endpoint ${endpointId}: ${stacksForEndpoint.length}`)
              if (stacksForEndpoint.length > 0) {
                core.info('\nДоступные стеки:')
                stacksForEndpoint.forEach(s => {
                  core.info(`  📦 ${s.Name} (ID: ${s.Id})`)
                })
              } else {
                core.warning(`⚠️  Нет стеков для endpoint ${endpointId}`)
                
                // Покажем стеки из других endpoints
                const otherStacks = allStacks.filter(s => s.EndpointId !== endpointId)
                if (otherStacks.length > 0) {
                  core.info('\nСтеки в других endpoints:')
                  otherStacks.forEach(s => {
                    core.info(`  📦 ${s.Name} (ID: ${s.Id}, Endpoint: ${s.EndpointId})`)
                  })
                }
              }
            } catch (listError) {
              core.warning('Не удалось получить список стеков')
            }
            
            throw new Error(
              `Стек с ID ${stackId} не найден.\n\n` +
              `Проверьте список доступных стеков выше ☝️\n\n` +
              `Решения:\n` +
              `1. Укажите правильный stack-id из списка выше\n` +
              `2. ИЛИ добавьте stack-name вместо stack-id\n` +
              `3. ИЛИ укажите оба (stack-id для скорости + stack-name как fallback)`
            )
          }
        } else {
          throw error
        }
      }
    } 
    // Иначе получаем все стеки и ищем по имени
    else if (stackName) {
      core.info(`Поиск стека по имени: ${stackName}`)
      const allStacks = await portainerApi.getStacks()
      existingStack = allStacks.find(s => s.Name === stackName)

      if (!existingStack) {
        throw new Error(`Стек с именем "${stackName}" не найден. Пожалуйста, сначала создайте стек вручную в Portainer.`)
      }
      core.info(`Найден существующий стек с именем: ${stackName} (ID: ${existingStack.Id})`)
    }
    else {
      throw new Error('Не указан ни stack-name, ни stack-id')
    }

    let stackDefinitionToDeploy: string
    if (useExistingStack) {
      core.info(`Получение определения стека с сервера (ID: ${existingStack.Id})`)
      const stackFileContent = await portainerApi.getStackFile(existingStack.Id)
      if (!stackFileContent || !stackFileContent.trim()) {
        throw new Error('Стек на сервере не содержит определения (пустой StackFileContent)')
      }
      stackDefinitionToDeploy = prepareStackDefinition(stackFileContent, undefined, image)
    } else {
      const stackDefFilePath = path.join(process.env.GITHUB_WORKSPACE as string, stackDefinitionFile!)
      core.info(`Чтение файла стека из ${stackDefFilePath}`)
      const fileContent = fs.readFileSync(stackDefFilePath, 'utf8')
      if (!fileContent) {
        throw new Error(`Не удалось найти файл стека: ${stackDefFilePath}`)
      }
      stackDefinitionToDeploy = prepareStackDefinition(fileContent, templateVariables, image)
    }

    core.debug(stackDefinitionToDeploy)

    core.info(
      `Обновление стека... Id: ${existingStack.Id} EndpointId: ${existingStack.EndpointId}`
    )
    core.info(`Переменные окружения: с сервера (${existingStack.Env?.length ?? 0} шт.)`)
    core.info(`Параметры обновления: prune=${prune || false}, pullImage=${pullImage || false}`)
    await portainerApi.updateStack(
      existingStack.Id,
      {
        endpointId: existingStack.EndpointId
      },
      {
        env: existingStack.Env ?? [],
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
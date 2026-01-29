import * as core from '@actions/core'
import axios from 'axios'
import { deployStack } from './deploy'

export async function run(): Promise<void> {
  try {
    const portainerHost: string = core.getInput('portainer-host', {
      required: true
    })
    const apiKey: string = core.getInput('api-key', {
      required: true
    })
    const endpointId: string = core.getInput('endpoint-id', {
      required: true
    })
    const stackName: string = core.getInput('stack-name', {
      required: false
    })
    const stackIdInput: string = core.getInput('stack-id', {
      required: false
    })
    const stackId: number | undefined = stackIdInput ? parseInt(stackIdInput) : undefined
    
    // Проверяем что указан хотя бы один из параметров (игнорируем пустые строки)
    const hasStackName = stackName && stackName.trim().length > 0
    const hasStackId = stackId !== undefined && !isNaN(stackId)
    
    if (!hasStackName && !hasStackId) {
      throw new Error('Необходимо указать stack-name или stack-id')
    }
    
    const stackDefinitionFile: string = core.getInput('stack-definition', {
      required: true
    })
    const templateVariables: string = core.getInput('template-variables', {
      required: false
    })
    const image: string = core.getInput('image', {
      required: false
    })
    const prune: boolean = core.getBooleanInput('prune', {
      required: false
    })
    const pullImage: boolean = core.getBooleanInput('pullImage', {
      required: false
    })

    await deployStack({
      portainerHost,
      apiKey,
      endpointId: parseInt(endpointId) || 1,
      stackName,
      stackId,
      stackDefinitionFile,
      templateVariables: templateVariables ? JSON.parse(templateVariables) : undefined,
      image,
      prune,
      pullImage
    })
    core.info('✅ Развертывание завершено успешно')
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      const {
        status,
        data,
        config: { url, method }
      } = error.response
      return core.setFailed(
        `Ошибка HTTP запроса ${status} (${method} ${url}):\n${JSON.stringify(
          data,
          (key, value) => {
            if (value instanceof Error) {
              return {
                message: value.message,
                stack: value.stack
              }
            }
            return value
          },
          2
        )}`
      )
    }
    return core.setFailed(error as Error)
  }
}

run()
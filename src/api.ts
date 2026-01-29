import axios, { AxiosInstance } from 'axios'

type EnvVariables = Array<{
  name: string
  value: string
}>

type EndpointId = number

type StackData = {
  Id: number
  Name: string
  EndpointId: EndpointId
  Env: EnvVariables
}

type UpdateStackParams = { endpointId: EndpointId }
type UpdateStackBody = {
  env: EnvVariables
  stackFileContent: string
  prune: boolean
  pullImage: boolean
}

export class PortainerApi {
  private axiosInstance: AxiosInstance

  constructor(host: string, apiKey: string) {
    // Нормализация URL
    console.log(`[DEBUG] Входящий portainer-host: "${host}"`)
    
    // Убираем trailing slashes
    let cleanHost = host.replace(/\/+$/, '')
    
    // Проверяем что есть протокол
    if (!cleanHost.startsWith('http://') && !cleanHost.startsWith('https://')) {
      console.log('[WARNING] Хост без протокола, добавляем https://')
      cleanHost = `https://${cleanHost}`
    }
    
    // Убираем /api из конца если уже есть
    if (cleanHost.endsWith('/api')) {
      cleanHost = cleanHost.slice(0, -4)
    }
    
    const baseURL = `${cleanHost}/api`
    console.log(`[DEBUG] Итоговый base URL: ${baseURL}`)
    console.log(`[DEBUG] X-API-Key установлен: ${apiKey ? 'да' : 'нет'}`)
    
    this.axiosInstance = axios.create({
      baseURL,
      headers: {
        'X-API-Key': apiKey,
        'X-Registry-Auth': `eyJyZWdpc3RyeUlkIjoxfQ==`
      }
    })
  }

  async getStacks(): Promise<StackData[]> {
    const url = '/stacks'
    console.log(`[DEBUG] Запрос к: ${this.axiosInstance.defaults.baseURL}${url}`)
    console.log(`[DEBUG] Заголовки:`, {
      'X-API-Key': this.axiosInstance.defaults.headers['X-API-Key'] ? '***' : 'отсутствует',
      'X-Registry-Auth': this.axiosInstance.defaults.headers['X-Registry-Auth'] || 'отсутствует'
    })
    
    const { data } = await this.axiosInstance.get<StackData[]>(url)
    return data
  }

  async getStack(id: number): Promise<StackData> {
    const url = `/stacks/${id}`
    console.log(`[DEBUG] Запрос к: ${this.axiosInstance.defaults.baseURL}${url}`)
    console.log(`[DEBUG] Заголовки:`, {
      'X-API-Key': this.axiosInstance.defaults.headers['X-API-Key'] ? '***' : 'отсутствует',
      'X-Registry-Auth': this.axiosInstance.defaults.headers['X-Registry-Auth'] || 'отсутствует'
    })
    
    const { data } = await this.axiosInstance.get<StackData>(url)
    return data
  }

  async updateStack(id: number, params: UpdateStackParams, body: UpdateStackBody): Promise<void> {
    await this.axiosInstance.put(`/stacks/${id}`, body, { params })
  }
}
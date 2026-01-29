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
    this.axiosInstance = axios.create({
      baseURL: `${host}/api`,
      headers: {
        'X-API-Key': apiKey,
        'X-Registry-Auth': `eyJyZWdpc3RyeUlkIjoxfQ==`
      }
    })
  }

  async getStacks(): Promise<StackData[]> {
    const { data } = await this.axiosInstance.get<StackData[]>('/stacks')
    return data
  }

  async getStack(id: number): Promise<StackData> {
    const { data } = await this.axiosInstance.get<StackData>(`/stacks/${id}`)
    return data
  }

  async updateStack(id: number, params: UpdateStackParams, body: UpdateStackBody): Promise<void> {
    await this.axiosInstance.put(`/stacks/${id}`, body, { params })
  }
}
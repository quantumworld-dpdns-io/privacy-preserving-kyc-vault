export interface ServiceParams {
  id: string;
  type: string;
  serviceEndpoint?: string;
  endpoints?: string[];
}

export class Service {
  public readonly id: string;
  public readonly type: string;
  public readonly serviceEndpoint?: string;
  public readonly endpoints: string[];

  constructor(params: ServiceParams) {
    this.id = params.id;
    this.type = params.type;
    this.serviceEndpoint = params.serviceEndpoint;
    this.endpoints = params.endpoints ?? [];
  }

  addEndpoint(endpoint: string): void {
    this.endpoints.push(endpoint);
  }

  toJSON(): ServiceParams {
    return {
      id: this.id,
      type: this.type,
      serviceEndpoint: this.serviceEndpoint,
      endpoints: this.endpoints.length > 0 ? this.endpoints : undefined,
    };
  }
}

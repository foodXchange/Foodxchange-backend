import { OpenAIService } from '../azure/openAI.service';

export class OpenAIWrapper {
  private static instance: OpenAIWrapper;
  private readonly openAIService: OpenAIService;

  private constructor() {
    this.openAIService = new OpenAIService();
  }

  public static getInstance(): OpenAIWrapper {
    if (!OpenAIWrapper.instance) {
      OpenAIWrapper.instance = new OpenAIWrapper();
    }
    return OpenAIWrapper.instance;
  }

  public getService(): OpenAIService {
    return this.openAIService;
  }
}

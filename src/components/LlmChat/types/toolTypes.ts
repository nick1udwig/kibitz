export interface Tool {
  name: string;
  description: string;
  input_schema: {
    type?: 'object';
    properties?: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

export interface WsTool {
  name: string;
  description: string;
  inputSchema: {
    type?: 'object';
    properties?: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

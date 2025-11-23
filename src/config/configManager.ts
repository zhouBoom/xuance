import fs from 'fs';
import path from 'path';

interface Config {
    taskPollingInterval: number;
    maxConcurrentTasks: number;
    supportedPlatforms: string[];
    defaultTaskSettings: {
        timeout: number;
        retryAttempts: number;
        browserOptions: {
            headless: boolean;
            incognito: boolean;
        };
    };
}

class ConfigManager {
    private config: Config;
    private readonly configPath = path.join(__dirname, 'config.json');

    constructor() {
        this.config = this.loadConfig();
    }

    private loadConfig(): Config {
        const configData = fs.readFileSync(this.configPath, 'utf-8');
        return JSON.parse(configData) as Config;
    }

    public getConfig(): Config {
        return this.config;
    }

    public updateConfig(newConfig: Partial<Config>) {
        this.config = { ...this.config, ...newConfig };
        fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
    }
}

export const configManager = new ConfigManager();
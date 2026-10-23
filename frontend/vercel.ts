import { createDeploymentConfig } from './deployment/config';

export const config = createDeploymentConfig(process.env.BACKEND_URL);

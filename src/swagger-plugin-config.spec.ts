import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Swagger plugin config', () => {
  it('generates OpenAPI metadata for response DTO files', () => {
    const nestCliConfigPath = join(__dirname, '..', 'nest-cli.json');
    const nestCliConfig = JSON.parse(readFileSync(nestCliConfigPath, 'utf8'));
    const swaggerPlugin = nestCliConfig.compilerOptions.plugins.find(
      (plugin: { name?: string }) => plugin.name === '@nestjs/swagger',
    );

    expect(swaggerPlugin?.options?.dtoFileNameSuffix).toContain('.response.ts');
  });
});

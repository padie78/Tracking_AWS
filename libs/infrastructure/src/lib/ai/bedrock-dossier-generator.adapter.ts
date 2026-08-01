import type {
  DossierAiGenerateInput,
  DossierAiGenerateResult,
  IDossierAiGenerator,
} from '@track-aws/application';

/**
 * Generador de dossier vía Bedrock.
 * Stub determinista hasta cablear `BedrockRuntimeClient` + prompt FinOps.
 */
export class BedrockDossierGeneratorAdapter implements IDossierAiGenerator {
  async generate(input: DossierAiGenerateInput): Promise<DossierAiGenerateResult> {
    const total = input.findings.reduce(
      (sum, f) => sum + f.estimatedMonthlySavings.amount,
      0,
    );
    const byCategory = {
      rightsizing: input.findings.filter((f) => f.category === 'rightsizing').length,
      modernization: input.findings.filter((f) => f.category === 'modernization')
        .length,
      orphaned: input.findings.filter((f) => f.category === 'orphaned').length,
    };

    const markdownBody = [
      `# Dossier de Ahorro — cuenta ${input.accountId}`,
      '',
      `**Ahorro mensual estimado:** USD ${total.toFixed(2)}`,
      '',
      '## Hallazgos por categoría',
      '',
      `- Right-sizing: ${byCategory.rightsizing}`,
      `- Modernización: ${byCategory.modernization}`,
      `- Recursos huérfanos: ${byCategory.orphaned}`,
      '',
      '## Priorización',
      '',
      ...input.findings
        .slice()
        .sort(
          (a, b) =>
            b.estimatedMonthlySavings.amount - a.estimatedMonthlySavings.amount,
        )
        .slice(0, 10)
        .map(
          (f, i) =>
            `${i + 1}. **${f.title}** — USD ${f.estimatedMonthlySavings.amount.toFixed(2)}/mes`,
        ),
    ].join('\n');

    return {
      title: `Dossier FinOps ${input.scanId}`,
      markdownBody,
      remediationSteps: input.findings.slice(0, 5).map((f, index) => ({
        order: index + 1,
        title: f.title,
        instruction: f.recommendedAction,
        estimatedMinutes: 30,
      })),
    };
  }
}

import { AltiriaSmsProvider } from './altiria-sms.provider';

const hasCredentials =
  !!process.env.ALTIRIA_USERNAME && !!process.env.ALTIRIA_API_PASSWORD;
const testTo = process.env.ALTIRIA_TEST_TO;

const describeIntegration = hasCredentials && testTo ? describe : describe.skip;

describeIntegration('AltiriaSmsProvider (integration)', () => {
  let provider: AltiriaSmsProvider;

  beforeAll(() => {
    provider = new AltiriaSmsProvider({
      username: process.env.ALTIRIA_USERNAME!,
      apiPassword: process.env.ALTIRIA_API_PASSWORD!,
      apiUrl: process.env.SMS_API_URL ?? 'https://api.altiria.com',
      sender: process.env.SMS_SENDER,
      defaultCountryPrefix: process.env.SMS_DEFAULT_COUNTRY_PREFIX ?? '57',
    });
  });

  it('sends a real SMS and returns a providerMessageId', async () => {
    const result = await provider.send({
      to: testTo!,
      from: process.env.SMS_SENDER ?? '',
      content: 'Test automatize-it SMS - ignore',
      organizationId: 'integration-test',
    });

    expect(result.providerMessageId).toBeDefined();
    expect(typeof result.providerMessageId).toBe('string');
    expect(result.providerMessageId.length).toBeGreaterThan(0);
    expect(result.segments).toBeGreaterThan(0);

    console.log(
      `Altiria integration test: providerMessageId=${result.providerMessageId}, segments=${result.segments}`,
    );
  }, 30_000);

  it('does not expose credentials in logs', async () => {
    const consoleSpy = jest.spyOn(console, 'log');

    await provider.send({
      to: testTo!,
      from: process.env.SMS_SENDER ?? '',
      content: 'Credential leak check',
      organizationId: 'integration-test',
    });

    const allLogs = consoleSpy.mock.calls.flat().join(' ');
    expect(allLogs).not.toContain(process.env.ALTIRIA_API_PASSWORD);

    consoleSpy.mockRestore();
  }, 30_000);
});

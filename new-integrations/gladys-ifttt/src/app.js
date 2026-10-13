// -----------------------------------------------------------------------------
// The integration itself: the IFTTT client built from the configuration, the
// scene actions, the inbound webhook, the widget and the test button.
// index.js only wires the SDK handlers to it.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { SCENE_TRIGGERS, WEBHOOKS } from './constants.js';
import { T } from './i18n.js';
import { IftttClient, IftttError, parsePayload, validateEventName } from './ifttt.js';
import { inboundEvent } from './inbound.js';

export class IftttApp {
  constructor({ gladys, logger = createLogger({ name: 'ifttt' }) }) {
    this.gladys = gladys;
    this.logger = logger;
    this.config = normalizeConfig();
    this.client = new IftttClient({ key: '' });
    this.inboundUrl = undefined;
    this.lastStatus = undefined;
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(raw = {}) {
    this.config = normalizeConfig(raw);
    this.client = new IftttClient({ key: this.config.webhooksKey });
    await this.refreshWebhooks();
    await this.reportStatus();
  }

  /** Re-read the Gladys Plus relay state (also on onWebhookUpdated). */
  async refreshWebhooks(info) {
    try {
      const { available, webhooks } = info ?? (await this.gladys.getWebhooks());
      this.inboundUrl = available
        ? webhooks.find((w) => w.key === WEBHOOKS.INBOUND)?.url
        : undefined;
    } catch (err) {
      this.logger.warn(`Webhook state unavailable: ${err.message}`);
      this.inboundUrl = undefined;
    }
  }

  async reportStatus() {
    const ok = Boolean(this.config.webhooksKey);
    const message = ok ? T.ready(Boolean(this.inboundUrl)) : T.noKey;
    const key = JSON.stringify([ok, message]);
    if (key === this.lastStatus) {
      return;
    }
    this.lastStatus = key;
    await this.gladys
      .setConnectionStatus(ok, message)
      .catch((err) => this.logger.warn(`setConnectionStatus failed: ${err.message}`));
  }

  // --- Scene actions ---------------------------------------------------------

  /** "Trigger an IFTTT event": value1..value3. */
  async triggerEvent(fields = {}) {
    const event = validateEventName(fields.event);
    const answer = await this.client.trigger(event, fields);
    this.logger.info(`Triggered IFTTT event "${event}"`);
    return { event, answer };
  }

  /** "Trigger an IFTTT event with a JSON payload". */
  async triggerEventJson(fields = {}) {
    const event = validateEventName(fields.event);
    const answer = await this.client.triggerJson(event, parsePayload(fields.payload));
    this.logger.info(`Triggered IFTTT event "${event}" (JSON)`);
    return { event, answer };
  }

  // --- Inbound webhook (Gladys Plus) ------------------------------------------

  /** A request relayed by Gladys Plus -> the `event_received` scene event. */
  async handleInbound(request) {
    const result = inboundEvent(request, { secret: this.config.inboundSecret });
    if (!result.ok) {
      this.logger.warn(`Inbound request ignored: ${result.reason}`);
      return;
    }
    this.logger.info(`Inbound IFTTT event "${result.data.event}"`);
    await this.gladys.publishSceneEvent(SCENE_TRIGGERS.RECEIVED, result.data);
  }

  // --- Dashboard widget ------------------------------------------------------

  async getWidget({ settings = {} } = {}) {
    const event = String(settings.event ?? '').trim();
    const label = String(settings.label ?? '').trim() || event || 'IFTTT';
    const components = [{ type: 'text', text: label, variant: 'heading' }];
    if (settings.description) {
      components.push({ type: 'text', text: String(settings.description), variant: 'caption' });
    } else {
      components.push({ type: 'text', text: T.widget.caption, variant: 'caption' });
    }
    components.push({
      type: 'button',
      label: String(settings.button_label ?? '').trim() || { en: 'Trigger', fr: 'Déclencher' },
      icon: 'zap',
      style: 'primary',
      action: { key: 'trigger', confirm: Boolean(settings.confirm) },
    });
    return { ttl_seconds: 3600, components };
  }

  async widgetAction(actionKey, _params, { settings = {} } = {}) {
    const event = String(settings.event ?? '').trim();
    if (actionKey !== 'trigger' || !event) {
      return T.widget.noEvent;
    }
    try {
      await this.client.trigger(event, { value1: settings.value1 });
      return T.widget.sent(event);
    } catch (err) {
      return T.widget.failed(err.message);
    }
  }

  // --- Configuration screen button -------------------------------------------

  async testConnection(fields = {}) {
    const event = String(fields.event ?? '').trim() || 'gladys_test';
    await this.refreshWebhooks();
    const inbound = this.inboundUrl ? T.inboundUrl(this.inboundUrl) : T.inboundMissing;
    try {
      const answer = await this.client.trigger(event, { value1: 'Gladys', value2: 'test' });
      await this.reportStatus();
      const ok = T.testOk(event, answer);
      return { en: ok.en + inbound.en, fr: ok.fr + inbound.fr };
    } catch (err) {
      const code = err instanceof IftttError ? err.code : 'error';
      const failed = T.testFailed(code, err.message);
      return { en: failed.en + inbound.en, fr: failed.fr + inbound.fr };
    }
  }
}

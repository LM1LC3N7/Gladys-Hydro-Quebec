// -----------------------------------------------------------------------------
// Publishes only the device feature states that actually changed.
//
// Hydro-Québec data moves slowly (a daily figure, a balance, an outage flag)
// while this integration re-reads it every poll and at every peak transition:
// republishing identical values filled each feature's history with dozens of
// duplicate points a day (Gladys 5.1.2 flags such "verbose" devices).
//
// Two kinds of states:
//   - live states (no `created_at`): published when the value differs from
//     the last one published (or known to Gladys) for that feature;
//   - dated states (`created_at`, e.g. the daily consumption of a past day):
//     published only for a day newer than the last one recorded, so the same
//     day is never stored twice.
// -----------------------------------------------------------------------------

function stateValue(state) {
  return state.text !== undefined ? `text:${state.text}` : `num:${state.state}`;
}

export class StatePublisher {
  constructor() {
    this.last = new Map(); // feature external_id -> { value, at }
  }

  /**
   * Seed the memory from the features Gladys already knows (`gladys.devices`,
   * refreshed on every connection), so a restart neither republishes
   * unchanged values nor stores the same day twice.
   */
  seed(devices = []) {
    for (const device of devices) {
      for (const feature of device.features ?? []) {
        if (!feature.external_id || this.last.has(feature.external_id)) continue;
        const at = Date.parse(feature.last_value_changed);
        const hasValue = feature.last_value !== null && feature.last_value !== undefined;
        this.last.set(feature.external_id, {
          value: hasValue ? `num:${Number(feature.last_value)}` : null,
          at: Number.isFinite(at) ? at : null,
        });
      }
    }
  }

  /** Forget features (e.g. a device the user just created) so their next value is published. */
  forget(externalIds = []) {
    for (const id of externalIds) this.last.delete(id);
  }

  /** The states worth publishing (changed values, newer days); records nothing. */
  changed(states) {
    return states.filter((state) => {
      const previous = this.last.get(state.device_feature_external_id);
      if (state.created_at === undefined) return previous?.value !== stateValue(state);
      const at = Date.parse(state.created_at);
      if (!Number.isFinite(at)) return false;
      return previous?.at === null || previous?.at === undefined || at > previous.at;
    });
  }

  /** Record states as published: call it only once Gladys accepted them. */
  commit(states) {
    for (const state of states) {
      const at = state.created_at === undefined ? Date.now() : Date.parse(state.created_at);
      this.last.set(state.device_feature_external_id, { value: stateValue(state), at });
    }
  }
}

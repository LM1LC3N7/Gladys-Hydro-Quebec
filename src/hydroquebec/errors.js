// -----------------------------------------------------------------------------
// Error types for the Hydro-Québec client.
// -----------------------------------------------------------------------------

export class HydroQcError extends Error {}

export class HydroQcHttpError extends HydroQcError {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export class HydroQcAuthError extends HydroQcError {}

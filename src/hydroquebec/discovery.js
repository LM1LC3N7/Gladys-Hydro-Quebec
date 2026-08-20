// -----------------------------------------------------------------------------
// Contract discovery.
//
// Ported from hydroqc's WebUser / Customer / Account classes (webuser.py,
// customer.py, account.py), flattened into a single list of "contract
// descriptors" — one per Hydro-Québec contract reachable by this login,
// across every customer ("Titulaire") and account ("compte-contrat") linked
// to it. This is what lets one Gladys login expose several devices when the
// account has several contracts (e.g. a primary residence + a rental).
// -----------------------------------------------------------------------------

/**
 * @typedef {object} ContractDescriptor
 * @property {string} applicantId - "noPartenaireDemandeur", the logged-in user.
 * @property {string} customerId - "noPartenaireTitulaire", the contract holder.
 * @property {string[]} customerNames
 * @property {string} accountId - "noCompteContrat".
 * @property {string} contractId - "noContrat".
 * @property {string} address
 * @property {string} consumptionLocationId - "idLieuConsommation", used for outages.
 * @property {string} meterNumber
 * @property {string} rate - e.g. "D", "DT", "DPC", "M".
 * @property {string} rateOption - e.g. "CPC", "GDP", or "".
 * @property {object|null} account - raw billing/balance info for the account.
 */

/** @returns {Promise<ContractDescriptor[]>} */
export async function discoverContracts(client, logger) {
  const relations = await client.getUserInfo();

  const customersById = new Map();
  for (const relation of relations) {
    const customerId = relation.noPartenaireTitulaire;
    if (customersById.has(customerId)) continue;
    const names = Object.entries(relation)
      .filter(([key]) => key.startsWith('nom') && key.endsWith('Titulaire'))
      .map(([, value]) => String(value))
      .filter(Boolean);
    customersById.set(customerId, { applicantId: relation.noPartenaireDemandeur, customerId, names });
  }

  const contracts = [];
  for (const customer of customersById.values()) {
    logger.debug(`Discovering contracts for customer ${customer.customerId}`);
    const customerInfo = await client.getCustomerInfo(customer.applicantId, customer.customerId);
    const accountsSummary = await client.listAccountContract(customer.applicantId, customer.customerId);

    const accountDetailsById = new Map();
    for (const account of customerInfo?.infoCockpitPourPartenaireModel?.listeComptesContrats ?? []) {
      accountDetailsById.set(account.noCompteContrat, account);
    }

    for (const accountEntry of accountsSummary.comptesContrats ?? []) {
      const accountId = accountEntry.noCompteContrat;
      for (const contractId of accountEntry.listeNoContrat ?? []) {
        const contractInfo = await client.getContractInfo(
          customer.applicantId,
          customer.customerId,
          accountId,
          contractId,
        );
        contracts.push({
          applicantId: customer.applicantId,
          customerId: customer.customerId,
          customerNames: customer.names,
          accountId,
          contractId,
          address: contractInfo.adresseConsommation,
          consumptionLocationId: contractInfo.idLieuConsommation,
          meterNumber: contractInfo.noCompteur,
          rate: contractInfo.tarifActuel,
          rateOption: contractInfo.optionTarifActuel || '',
          account: accountDetailsById.get(accountId) ?? null,
        });
      }
    }
  }
  logger.info(`Discovered ${contracts.length} Hydro-Québec contract(s)`);
  return contracts;
}

/** Is this contract enrolled in the Winter Credit dynamic rate option? */
export function isCpcContract(contract) {
  return contract.rate === 'D' && contract.rateOption === 'CPC';
}

/** Is this contract billed under the Flex D dynamic rate? */
export function isDpcContract(contract) {
  return contract.rate === 'DPC';
}

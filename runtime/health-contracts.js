'use strict';

const fs = require('fs');
const path = require('path');

const FLOWS_DIR = path.join(__dirname, '..', 'contracts', 'flows');
const FLOW_ID_RE = /^[A-Z][A-Z0-9_]*$/;

/**
 * Charge les contrats de santé déclaratifs.
 * Les supervision_rules sont une projection, pas une copie indépendante.
 * @param {string} [dir]
 * @returns {{ flows: Object[], rules: Object[] }}
 */
function loadHealthContracts(dir = FLOWS_DIR) {
    const flows = [];
    if (!fs.existsSync(dir)) {
        return { flows, rules: [] };
    }
    const names = fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort();
    for (const name of names) {
        let raw;
        try {
            raw = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
        } catch {
            continue;
        }
        if (!raw || !FLOW_ID_RE.test(raw.flow_id)) continue;
        if (!raw.health_contract || !Array.isArray(raw.health_contract.clauses)) continue;
        flows.push(raw);
    }
    return { flows, rules: deriveSupervisionRules(flows) };
}

/**
 * @param {Object[]} flows
 * @returns {Object[]}
 */
function deriveSupervisionRules(flows) {
    const rules = [];
    for (const flow of flows || []) {
        const version = Number(flow.version) || 1;
        const clauses = (flow.health_contract && flow.health_contract.clauses) || [];
        for (const clause of clauses) {
            if (!clause || !clause.id || clause.kind !== 'event_failure') continue;
            rules.push({
                rule_id: `${flow.flow_id}:${clause.id}:v${version}`,
                flow_id: flow.flow_id,
                clause_id: clause.id,
                kind: clause.kind,
                enabled: true,
                version,
                event_types: Array.isArray(clause.event_types) ? clause.event_types.slice() : [],
                success_types: Array.isArray(clause.success_types) ? clause.success_types.slice() : [],
                source: 'health_contract'
            });
        }
    }
    return rules;
}

/**
 * @param {Object[]} flows
 * @param {string} flowId
 * @returns {Object|null}
 */
function getFlowContract(flows, flowId) {
    return (flows || []).find((f) => f.flow_id === flowId) || null;
}

module.exports = {
    FLOWS_DIR,
    loadHealthContracts,
    deriveSupervisionRules,
    getFlowContract
};

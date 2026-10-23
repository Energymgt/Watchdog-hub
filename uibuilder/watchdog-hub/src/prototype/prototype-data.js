(function (global) {
    'use strict';

    /**
     * Jeu de données réaliste pour le prototype interactif Watchdog Hub
     * Couvre :
     * - Les 3 flux déclarés dans contracts/flows/ + 1 flux additionnel pour illustrer tous les états (down, degraded, ok, unknown)
     * - Les passerelles BACnet et Modbus dans tous les états (ok, dead, heartbeat_missing, cloud_down, unknown_online, unknown)
     * - Les incidents avec graphe complet (DETECTE, OUVERT, EN_ANALYSE, EN_CORRECTION, EN_VALIDATION, RESOLU, CLOS)
     * - Les alertes (open, acknowledged, closed) avec livraisons Teams
     * - Les anomalies (open, closed) et les événements techniques immuables avec payload JSON
     */
    function createDemoDataset(nowMs) {
        var now = nowMs || Date.now();
        function isoAgo(minutes) {
            return new Date(now - minutes * 60 * 1000).toISOString();
        }

        var flows = [
            {
                flow_id: 'CSV_OASSIS_01',
                name: 'Import CSV OASSIS vers SQL PLUTO',
                status: 'down',
                status_reason: 'incident_confirmed',
                source_id: 'SRC_SMB_OASSIS',
                connector_id: 'CONN_CSV_TO_SQL',
                destination_id: 'DST_SQL_PLUTO',
                producer: 'csv-to-sql',
                last_event_id: 'evt-0192b8f4-901',
                last_event_at: isoAgo(8)
            },
            {
                flow_id: 'METEO_01',
                name: 'Import Auto MeteoSwiss OGD',
                status: 'degraded',
                status_reason: 'incident_detecte',
                source_id: 'SRC_METEOSWISS_OGD',
                connector_id: 'CONN_API_METEO',
                destination_id: 'DST_SQL_METEO',
                producer: 'api-meteo',
                last_event_id: 'evt-0192b8f4-902',
                last_event_at: isoAgo(14)
            },
            {
                flow_id: 'METEO_STAT_DAILY',
                name: 'Agrégation Quotidienne Genève STAT',
                status: 'ok',
                status_reason: 'nominal',
                source_id: 'SRC_SQL_METEO',
                connector_id: 'CONN_DJU_WORKER',
                destination_id: 'DST_SQL_GENEVE_STAT',
                producer: 'dju-daily',
                last_event_id: 'evt-0192b8f4-903',
                last_event_at: isoAgo(42)
            },
            {
                flow_id: 'BACNET_ARCHIVER_02',
                name: 'Synchronisation Télémétrie CVC Meyrin',
                status: 'unknown',
                status_reason: 'no_events',
                source_id: 'SRC_GW_MEYRIN',
                connector_id: 'CONN_MQTT_INGEST',
                destination_id: 'DST_INFLUX_TSDB',
                producer: 'bacnet-gateway',
                last_event_id: null,
                last_event_at: null
            }
        ];

        var rules = [
            { id: 'rule-csv-avail', flow_id: 'CSV_OASSIS_01', clause_id: 'availability', kind: 'event_failure', open_statuses: ['failure'], event_types: ['validation_failed', 'destination_error', 'timeout', 'execution_failed', 'connector_error'], success_types: ['execution_completed', 'data_received'] },
            { id: 'rule-meteo-avail', flow_id: 'METEO_01', clause_id: 'availability', kind: 'event_failure', open_statuses: ['failure'], event_types: ['connector_error', 'timeout', 'destination_error', 'execution_failed'], success_types: ['data_received', 'execution_completed'] },
            { id: 'rule-stat-avail', flow_id: 'METEO_STAT_DAILY', clause_id: 'availability', kind: 'event_failure', open_statuses: ['failure'], event_types: ['execution_failed', 'destination_error'], success_types: ['execution_completed'] },
            { id: 'rule-stat-fresh', flow_id: 'METEO_STAT_DAILY', clause_id: 'completeness', kind: 'event_failure', open_statuses: ['partial', 'failure'], event_types: ['data_missing'], success_types: ['execution_completed'] }
        ];

        var incidents = [
            {
                incident_id: 'INC-2026-0142',
                flow_id: 'CSV_OASSIS_01',
                state: 'EN_CORRECTION',
                clause_id: 'availability',
                error_signature: 'SQL_DEADLOCK_DST_PLUTO_INSERT',
                correlation_key: 'CSV_OASSIS_01|availability|SQL_DEADLOCK_DST_PLUTO_INSERT',
                opened_at: isoAgo(47),
                closed_at: null,
                history: [
                    { history_id: 'h-1', from_state: 'DETECTE', to_state: 'OUVERT', actor: 'c.catarino', reason: 'Prise en charge suite alerte Teams', changed_at: isoAgo(41) },
                    { history_id: 'h-2', from_state: 'OUVERT', to_state: 'EN_ANALYSE', actor: 'c.catarino', reason: 'Verrou détecté sur table dbo.PLUTO_RAW', changed_at: isoAgo(33) },
                    { history_id: 'h-3', from_state: 'EN_ANALYSE', to_state: 'EN_CORRECTION', actor: 'm.dupont', reason: 'Purge de la transaction bloquante et indexation en cours', changed_at: isoAgo(18) }
                ],
                actions: [
                    { action_id: 'act-1', actor: 'c.catarino', kind: 'note', comment: 'Le lot OASSIS de 09h15 a échoué 3 fois sur timeout SQL.', created_at: isoAgo(38) },
                    { action_id: 'act-2', actor: 'm.dupont', kind: 'transition', comment: 'Passage en correction après identification de la session bloquante SPID 74.', created_at: isoAgo(18) }
                ],
                links: [
                    { target_kind: 'flow', target_id: 'CSV_OASSIS_01' },
                    { target_kind: 'anomaly', target_id: 'ANM-0089' },
                    { target_kind: 'event', target_id: 'evt-0192b8f4-901' },
                    { target_kind: 'event', target_id: 'evt-0192b8f4-900' }
                ]
            },
            {
                incident_id: 'INC-2026-0143',
                flow_id: 'METEO_01',
                state: 'DETECTE',
                clause_id: 'availability',
                error_signature: 'UPSTREAM_HTTP_504_METEOSWISS_OGD',
                correlation_key: 'METEO_01|availability|UPSTREAM_HTTP_504_METEOSWISS_OGD',
                opened_at: isoAgo(14),
                closed_at: null,
                history: [
                    { history_id: 'h-10', from_state: 'DETECTE', to_state: 'DETECTE', actor: 'watchdog-internal', reason: 'Seuil de corrélation atteint (2 occurrences)', changed_at: isoAgo(14) }
                ],
                actions: [],
                links: [
                    { target_kind: 'flow', target_id: 'METEO_01' },
                    { target_kind: 'anomaly', target_id: 'ANM-0091' },
                    { target_kind: 'event', target_id: 'evt-0192b8f4-902' }
                ]
            },
            {
                incident_id: 'INC-2026-0140',
                flow_id: 'METEO_STAT_DAILY',
                state: 'EN_VALIDATION',
                clause_id: 'completeness',
                error_signature: 'SOURCE_DATA_INCOMPLETE_STATION_GVE',
                correlation_key: 'METEO_STAT_DAILY|completeness|SOURCE_DATA_INCOMPLETE_STATION_GVE',
                opened_at: isoAgo(190),
                closed_at: null,
                history: [
                    { history_id: 'h-20', from_state: 'DETECTE', to_state: 'OUVERT', actor: 'c.catarino', reason: 'Ouverture', changed_at: isoAgo(170) },
                    { history_id: 'h-21', from_state: 'OUVERT', to_state: 'EN_ANALYSE', actor: 'c.catarino', reason: 'Analyse série GVE', changed_at: isoAgo(140) },
                    { history_id: 'h-22', from_state: 'EN_ANALYSE', to_state: 'EN_CORRECTION', actor: 'c.catarino', reason: 'Rattrapage des tranches horaires manquantes', changed_at: isoAgo(95) },
                    { history_id: 'h-23', from_state: 'EN_CORRECTION', to_state: 'EN_VALIDATION', actor: 'c.catarino', reason: 'En attente de validation sur le run de contrôle', changed_at: isoAgo(42) }
                ],
                actions: [
                    { action_id: 'act-10', actor: 'c.catarino', kind: 'note', comment: 'Run de rattrapage terminé avec 24/24 enregistrements. Prêt à résoudre.', created_at: isoAgo(40) }
                ],
                links: [
                    { target_kind: 'flow', target_id: 'METEO_STAT_DAILY' },
                    { target_kind: 'anomaly', target_id: 'ANM-0084' },
                    { target_kind: 'event', target_id: 'evt-0192b8f4-903' }
                ]
            },
            {
                incident_id: 'INC-2026-0136',
                flow_id: 'CSV_OASSIS_01',
                state: 'RESOLU',
                clause_id: 'availability',
                error_signature: 'SMB_SHARE_UNREACHABLE',
                correlation_key: 'CSV_OASSIS_01|availability|SMB_SHARE_UNREACHABLE',
                opened_at: isoAgo(720),
                closed_at: null,
                history: [
                    { history_id: 'h-30', from_state: 'EN_VALIDATION', to_state: 'RESOLU', actor: 'c.catarino', reason: 'Partage SMB remonté et validé sur 3 cycles consécutifs', changed_at: isoAgo(580) }
                ],
                actions: [
                    { action_id: 'act-20', actor: 'c.catarino', kind: 'resolution', comment: 'Certificat et montage CIFS renouvelés.', created_at: isoAgo(580) }
                ],
                links: [
                    { target_kind: 'flow', target_id: 'CSV_OASSIS_01' }
                ]
            },
            {
                incident_id: 'INC-2026-0131',
                flow_id: 'METEO_01',
                state: 'CLOS',
                clause_id: 'availability',
                error_signature: 'DNS_LOOKUP_TIMEOUT',
                correlation_key: 'METEO_01|availability|DNS_LOOKUP_TIMEOUT',
                opened_at: isoAgo(1440),
                closed_at: isoAgo(1390),
                history: [
                    { history_id: 'h-40', from_state: 'DETECTE', to_state: 'CLOS', actor: 'watchdog-internal', reason: 'flow_recovered', changed_at: isoAgo(1390) }
                ],
                actions: [],
                links: [
                    { target_kind: 'flow', target_id: 'METEO_01' }
                ]
            }
        ];

        var anomalies = [
            {
                anomaly_id: 'ANM-0089',
                flow_id: 'CSV_OASSIS_01',
                clause_id: 'availability',
                status: 'open',
                error_signature: 'SQL_DEADLOCK_DST_PLUTO_INSERT',
                occurrence_count: 4,
                opened_at: isoAgo(52),
                closed_at: null,
                last_event_id: 'evt-0192b8f4-901'
            },
            {
                anomaly_id: 'ANM-0091',
                flow_id: 'METEO_01',
                clause_id: 'availability',
                status: 'open',
                error_signature: 'UPSTREAM_HTTP_504_METEOSWISS_OGD',
                occurrence_count: 2,
                opened_at: isoAgo(19),
                closed_at: null,
                last_event_id: 'evt-0192b8f4-902'
            },
            {
                anomaly_id: 'ANM-0084',
                flow_id: 'METEO_STAT_DAILY',
                clause_id: 'completeness',
                status: 'closed',
                error_signature: 'SOURCE_DATA_INCOMPLETE_STATION_GVE',
                occurrence_count: 2,
                opened_at: isoAgo(195),
                closed_at: isoAgo(42),
                last_event_id: 'evt-0192b8f4-903'
            }
        ];

        var events = [
            {
                event_id: 'evt-0192b8f4-901',
                flow_id: 'CSV_OASSIS_01',
                event_type: 'destination_error',
                status: 'failure',
                timestamp: isoAgo(8),
                source_id: 'SRC_SMB_OASSIS',
                connector_id: 'CONN_CSV_TO_SQL',
                destination_id: 'DST_SQL_PLUTO',
                producer: 'csv-to-sql',
                error_signature: 'SQL_DEADLOCK_DST_PLUTO_INSERT',
                payload: {
                    schema: 'watchdog.event.v1',
                    event_id: 'evt-0192b8f4-901',
                    flow_id: 'CSV_OASSIS_01',
                    event_type: 'destination_error',
                    status: 'failure',
                    timestamp: isoAgo(8),
                    source_id: 'SRC_SMB_OASSIS',
                    connector_id: 'CONN_CSV_TO_SQL',
                    destination_id: 'DST_SQL_PLUTO',
                    producer: 'csv-to-sql',
                    error_signature: 'SQL_DEADLOCK_DST_PLUTO_INSERT',
                    records: 0,
                    metadata: {
                        batch_file: 'OASSIS_EXPORT_20261023_0915.csv',
                        sql_error_code: 1205,
                        retry_attempt: 3
                    }
                }
            },
            {
                event_id: 'evt-0192b8f4-902',
                flow_id: 'METEO_01',
                event_type: 'timeout',
                status: 'failure',
                timestamp: isoAgo(14),
                source_id: 'SRC_METEOSWISS_OGD',
                connector_id: 'CONN_API_METEO',
                destination_id: 'DST_SQL_METEO',
                producer: 'api-meteo',
                error_signature: 'UPSTREAM_HTTP_504_METEOSWISS_OGD',
                payload: {
                    schema: 'watchdog.event.v1',
                    event_id: 'evt-0192b8f4-902',
                    flow_id: 'METEO_01',
                    event_type: 'timeout',
                    status: 'failure',
                    timestamp: isoAgo(14),
                    source_id: 'SRC_METEOSWISS_OGD',
                    connector_id: 'CONN_API_METEO',
                    destination_id: 'DST_SQL_METEO',
                    producer: 'api-meteo',
                    error_signature: 'UPSTREAM_HTTP_504_METEOSWISS_OGD',
                    metadata: {
                        station: 'GVE',
                        http_status: 504,
                        timeout_ms: 15000
                    }
                }
            },
            {
                event_id: 'evt-0192b8f4-900',
                flow_id: 'CSV_OASSIS_01',
                event_type: 'destination_error',
                status: 'failure',
                timestamp: isoAgo(23),
                source_id: 'SRC_SMB_OASSIS',
                connector_id: 'CONN_CSV_TO_SQL',
                destination_id: 'DST_SQL_PLUTO',
                producer: 'csv-to-sql',
                error_signature: 'SQL_DEADLOCK_DST_PLUTO_INSERT',
                payload: {
                    schema: 'watchdog.event.v1',
                    event_id: 'evt-0192b8f4-900',
                    flow_id: 'CSV_OASSIS_01',
                    event_type: 'destination_error',
                    status: 'failure',
                    timestamp: isoAgo(23),
                    source_id: 'SRC_SMB_OASSIS',
                    connector_id: 'CONN_CSV_TO_SQL',
                    destination_id: 'DST_SQL_PLUTO',
                    producer: 'csv-to-sql',
                    error_signature: 'SQL_DEADLOCK_DST_PLUTO_INSERT',
                    records: 0
                }
            },
            {
                event_id: 'evt-0192b8f4-903',
                flow_id: 'METEO_STAT_DAILY',
                event_type: 'execution_completed',
                status: 'success',
                timestamp: isoAgo(42),
                source_id: 'SRC_SQL_METEO',
                connector_id: 'CONN_DJU_WORKER',
                destination_id: 'DST_SQL_GENEVE_STAT',
                producer: 'dju-daily',
                error_signature: null,
                payload: {
                    schema: 'watchdog.event.v1',
                    event_id: 'evt-0192b8f4-903',
                    execution_id: 'exec-dju-20261023-01',
                    flow_id: 'METEO_STAT_DAILY',
                    event_type: 'execution_completed',
                    status: 'success',
                    timestamp: isoAgo(42),
                    source_id: 'SRC_SQL_METEO',
                    connector_id: 'CONN_DJU_WORKER',
                    destination_id: 'DST_SQL_GENEVE_STAT',
                    producer: 'dju-daily',
                    records: 24,
                    metadata: {
                        station: 'GVE',
                        dju_heating: 8.4
                    }
                }
            }
        ];

        var devices = [
            {
                uuid: '8f4a21c09e1b4d3a8821001122334455',
                name: 'GW-MODBUS-CHAUFFERIE-SUD',
                protocol: 'modbus',
                state: 'dead',
                confirmedState: 'dead',
                severity: 'critical',
                online: true,
                hbOk: true,
                lastConnectivity: isoAgo(1),
                lastHeartbeat: isoAgo(1),
                overallStatus: 'modbus_fault',
                detail: 'Projection santé Modbus : esclave RTU #12 muet sur RS485 (CRC/timeout après 3 essais)',
                gatewayGrace: false,
                pendingConfirmation: null,
                heartbeat: { retained: false, timestampTrusted: true },
                device: { app: 'emgt-modbus-edge-prod', host: 'balena-os-5.3.2' },
                health: {
                    ok: false,
                    status: 'RTU bus timeout slave 12',
                    nodeRed: { ok: true, uptimeSec: 412800 },
                    modbus: {
                        ok: false,
                        lastSuccessAt: isoAgo(29),
                        lastSuccessAgeSec: 1740,
                        recentError: true,
                        lastError: 'Timed out waiting for 8 bytes from unit 12 (baud 19200)',
                        queue: { state: 'warning', pending: 19, detail: 'File saturée sur esclave 12' }
                    }
                },
                mqtt: { ok: true, status: 'connected' },
                buffer: { state: 'warning', pending: 142, detail: 'Rétention SQLite locale active' },
                snapshot: null,
                supervisor: { unhealthy: [] },
                indicators: { bacnet: 'error', mqtt: 'ok', buffer: 'warning', supervisor: 'ok' },
                recentTransitions: [
                    { at: isoAgo(26), from: 'ok', to: 'dead', detail: 'Projection santé Modbus : health.modbus.ok = false' }
                ]
            },
            {
                uuid: '3c9d11a87b4e4c219a01ffeeddccbbaa',
                name: 'GW-BACNET-TOUR-LANCY-01',
                protocol: 'bacnet',
                state: 'heartbeat_missing',
                confirmedState: 'ok',
                severity: 'high',
                online: true,
                hbOk: false,
                lastConnectivity: isoAgo(2),
                lastHeartbeat: isoAgo(18),
                overallStatus: 'heartbeat_stale',
                detail: 'Balena en ligne mais dernier heartbeat MQTT reçu il y a 18 min (seuil 5 min)',
                gatewayGrace: false,
                pendingConfirmation: {
                    state: 'heartbeat_missing',
                    count: 1,
                    required: 2,
                    firstSeenGraceActive: false,
                    firstSeenGraceUntil: null
                },
                heartbeat: { retained: true, timestampTrusted: true },
                device: { app: 'emgt-bacnet-gateway', host: 'balena-os-5.2.0' },
                health: { ok: true, status: 'WHO-IS / I-AM nominal', nodeRed: { ok: true, uptimeSec: 89400 } },
                mqtt: { ok: false, status: 'reconnecting', lastError: 'Broker socket closed (ECONNRESET)' },
                buffer: { state: 'ok', pending: 4, detail: 'Nominal' },
                snapshot: { count: 48, empty: false },
                supervisor: { unhealthy: ['bacnet-collector'] },
                indicators: { bacnet: 'ok', mqtt: 'error', buffer: 'ok', supervisor: 'warning' },
                recentTransitions: [
                    { at: isoAgo(16), from: 'ok', to: 'heartbeat_missing', detail: 'Âge heartbeat supérieur à 5 min (confirmation 1/2)' }
                ]
            },
            {
                uuid: '7a1e55b20c884f10b223445566778899',
                name: 'GW-BACNET-SIEGE-GENEVE',
                protocol: 'bacnet',
                state: 'cloud_down',
                confirmedState: 'cloud_down',
                severity: 'warning',
                online: false,
                hbOk: true,
                lastConnectivity: isoAgo(64),
                lastHeartbeat: isoAgo(1),
                overallStatus: 'cloud_offline_hb_ok',
                detail: 'VPN Balena Cloud hors ligne, mais le flux MQTT terrain et BACnet fonctionnent normalement',
                gatewayGrace: false,
                pendingConfirmation: null,
                heartbeat: { retained: false, timestampTrusted: true },
                device: { app: 'emgt-bacnet-gateway', host: 'balena-os-5.3.2' },
                health: { ok: true, status: '62 équipements scrutés', nodeRed: { ok: true, uptimeSec: 1205400 } },
                mqtt: { ok: true, status: 'connected' },
                buffer: { state: 'ok', pending: 0, detail: 'Aucun point en attente' },
                snapshot: { count: 62, empty: false },
                supervisor: { unhealthy: [] },
                indicators: { bacnet: 'ok', mqtt: 'ok', buffer: 'ok', supervisor: 'ok' },
                recentTransitions: [
                    { at: isoAgo(60), from: 'ok', to: 'cloud_down', detail: 'Confirmé après 2 polls Balena : collecte locale maintenue' }
                ]
            },
            {
                uuid: '1b88e4f091234a558c99001122334466',
                name: 'GW-BACNET-CAROUGE-CENTRE',
                protocol: 'bacnet',
                state: 'ok',
                confirmedState: 'ok',
                severity: 'ok',
                online: true,
                hbOk: true,
                lastConnectivity: isoAgo(1),
                lastHeartbeat: isoAgo(1),
                overallStatus: 'nominal',
                detail: 'Passerelle opérationnelle (Balena en ligne + heartbeat MQTT récent)',
                gatewayGrace: false,
                pendingConfirmation: null,
                heartbeat: { retained: false, timestampTrusted: true },
                device: { app: 'emgt-bacnet-gateway', host: 'balena-os-5.3.2' },
                health: { ok: true, status: 'Nominal', nodeRed: { ok: true, uptimeSec: 650200 } },
                mqtt: { ok: true, status: 'connected' },
                buffer: { state: 'ok', pending: 0, detail: 'Vide' },
                snapshot: { count: 35, empty: false },
                supervisor: { unhealthy: [] },
                indicators: { bacnet: 'ok', mqtt: 'ok', buffer: 'ok', supervisor: 'ok' },
                recentTransitions: []
            },
            {
                uuid: '5d22c9a144774e889100aabbccddeeff',
                name: 'GW-MODBUS-VERNIER-PAC',
                protocol: 'modbus',
                state: 'ok',
                confirmedState: 'ok',
                severity: 'ok',
                online: true,
                hbOk: true,
                lastConnectivity: isoAgo(2),
                lastHeartbeat: isoAgo(1),
                overallStatus: 'nominal',
                detail: 'Passerelle Modbus TCP/RTU opérationnelle (8 compteurs lus)',
                gatewayGrace: false,
                pendingConfirmation: null,
                heartbeat: { retained: false, timestampTrusted: true },
                device: { app: 'emgt-modbus-edge-prod', host: 'balena-os-5.3.2' },
                health: {
                    ok: true,
                    status: 'Cycle Modbus 15s nominal',
                    nodeRed: { ok: true, uptimeSec: 512000 },
                    modbus: {
                        ok: true,
                        lastSuccessAt: isoAgo(0.2),
                        lastSuccessAgeSec: 12,
                        recentError: false,
                        lastError: null,
                        queue: { state: 'ok', pending: 0, detail: 'Temps réel' }
                    }
                },
                mqtt: { ok: true, status: 'connected' },
                buffer: { state: 'ok', pending: 0, detail: 'Vide' },
                snapshot: null,
                supervisor: { unhealthy: [] },
                indicators: { bacnet: 'ok', mqtt: 'ok', buffer: 'ok', supervisor: 'ok' },
                recentTransitions: []
            },
            {
                uuid: '9e00f1d288334b66a7778899aabbcc00',
                name: 'GW-PREDECLAREE-MEYRIN-LOT2',
                protocol: 'bacnet',
                state: 'unknown',
                confirmedState: null,
                severity: 'unknown',
                online: false,
                hbOk: false,
                lastConnectivity: null,
                lastHeartbeat: null,
                overallStatus: 'awaiting_first_signal',
                detail: 'En attente du premier heartbeat MQTT (appareil pré-déclaré dans la configuration)',
                gatewayGrace: false,
                pendingConfirmation: null,
                heartbeat: null,
                device: { app: 'Pré-enregistré', host: 'Non communiqué' },
                health: null,
                mqtt: null,
                buffer: null,
                snapshot: null,
                supervisor: null,
                indicators: { bacnet: 'unknown', mqtt: 'unknown', buffer: 'unknown', supervisor: 'unknown' },
                recentTransitions: [],
                enrolled: true
            }
        ];

        var alerts = [
            {
                alert_id: 'ALT-2026-088',
                plan: 'device',
                source_id: '8f4a21c09e1b4d3a8821001122334455',
                subject_name: 'GW-MODBUS-CHAUFFERIE-SUD',
                flow_id: null,
                incident_id: null,
                severity: 'critical',
                status: 'open',
                detail: 'Passage confirmé à Hors service (erreur Modbus RTU esclave #12)',
                opened_at: isoAgo(26),
                updated_at: isoAgo(25),
                acknowledged_by: null,
                acknowledged_at: null,
                latest_delivery: { status: 'sent', http_status: 200, possible_duplicate: false },
                history: [
                    { history_id: 'ah-1', at: isoAgo(26), event_type: 'trigger', actor: 'watchdog-fleet', reason: 'Seuil de confirmation atteint' }
                ],
                deliveries: [
                    { delivery_id: 'del-1', attempt: 1, event_type: 'trigger', status: 'sent', http_status: 200, error_kind: null, possible_duplicate: false }
                ]
            },
            {
                alert_id: 'ALT-2026-089',
                plan: 'flow',
                source_id: 'CSV_OASSIS_01',
                subject_name: 'Import CSV OASSIS vers SQL PLUTO',
                flow_id: 'CSV_OASSIS_01',
                incident_id: 'INC-2026-0142',
                severity: 'critical',
                status: 'acknowledged',
                detail: 'Incident INC-2026-0142 ouvert sur signature SQL_DEADLOCK_DST_PLUTO_INSERT',
                opened_at: isoAgo(47),
                updated_at: isoAgo(41),
                acknowledged_by: 'c.catarino',
                acknowledged_at: isoAgo(41),
                latest_delivery: { status: 'sent', http_status: 202, possible_duplicate: false },
                history: [
                    { history_id: 'ah-2', at: isoAgo(47), event_type: 'trigger', actor: 'watchdog-ingest', reason: 'Corrélation 2 occurrences' },
                    { history_id: 'ah-3', at: isoAgo(41), event_type: 'acknowledge', actor: 'c.catarino', reason: 'Accusé de réception opérateur' }
                ],
                deliveries: [
                    { delivery_id: 'del-2', attempt: 1, event_type: 'trigger', status: 'sent', http_status: 202, error_kind: null, possible_duplicate: false }
                ]
            },
            {
                alert_id: 'ALT-2026-085',
                plan: 'device',
                source_id: '7a1e55b20c884f10b223445566778899',
                subject_name: 'GW-BACNET-SIEGE-GENEVE',
                flow_id: null,
                incident_id: null,
                severity: 'high',
                status: 'open',
                detail: 'Cloud Balena hors ligne confirmé (2/2 polls), collecte MQTT active',
                opened_at: isoAgo(60),
                updated_at: isoAgo(60),
                acknowledged_by: null,
                acknowledged_at: null,
                latest_delivery: { status: 'sent', http_status: 200, possible_duplicate: false },
                history: [
                    { history_id: 'ah-4', at: isoAgo(60), event_type: 'trigger', actor: 'watchdog-fleet', reason: 'Transition vers cloud_down' }
                ],
                deliveries: [
                    { delivery_id: 'del-3', attempt: 1, event_type: 'trigger', status: 'sent', http_status: 200, error_kind: null, possible_duplicate: false }
                ]
            }
        ];

        var recentTransitions = [
            { at: isoAgo(26), uuid: '8f4a21c09e1b4d3a8821001122334455', name: 'GW-MODBUS-CHAUFFERIE-SUD', from: 'ok', to: 'dead', severity: 'critical', detail: 'Projection santé Modbus : esclave RTU #12 muet' },
            { at: isoAgo(60), uuid: '7a1e55b20c884f10b223445566778899', name: 'GW-BACNET-SIEGE-GENEVE', from: 'ok', to: 'cloud_down', severity: 'warning', detail: 'Confirmé après 2 polls Balena : VPN hors ligne, heartbeat OK' },
            { at: isoAgo(185), uuid: '1b88e4f091234a558c99001122334466', name: 'GW-BACNET-CAROUGE-CENTRE', from: 'heartbeat_missing', to: 'ok', severity: 'ok', detail: 'Retour au nominal confirmé [RECOVERY]' }
        ];

        var admin = {
            fleetName: 'Watchdog Hub — Siège EnergyMGT',
            balena: {
                configured: true,
                appId: 'energymgt/bacnet-fleet-prod\nenergymgt/modbus-edge-prod',
                tokenSet: true,
                tokenHint: '••••9f4a',
                source: 'ui'
            },
            mqtt: {
                host: 'iot.energymgt.io',
                port: 1883,
                topicPattern: 'bacnet/gateway/{uuid}/heartbeat',
                qos: 1,
                retain: true
            },
            teams: {
                configured: true,
                webhookHost: 'prod-42.westeurope.logic.azure.com'
            },
            settings: {
                offlineGraceMinutes: 5,
                firstSeenGraceMinutes: 5,
                confirmsRequired: 2,
                heartbeatTtlDays: 30,
                pollIntervalMs: 120000
            },
            enrolled: [
                {
                    uuid: '9e00f1d288334b66a7778899aabbcc00',
                    name: 'GW-PREDECLAREE-MEYRIN-LOT2',
                    enrolledAt: isoAgo(320)
                }
            ]
        };

        var sourceStatus = {
            balena: { ok: true, lastSuccessAt: isoAgo(1), lastError: null },
            mqtt: { ok: true, lastMessageAt: isoAgo(0.5), lastError: null },
            teams: { configured: true, lastSuccessAt: isoAgo(25), lastError: null }
        };

        return {
            generatedAt: isoAgo(0.5),
            lastEvaluationAt: isoAgo(0.5),
            nextPollAt: new Date(now + 90 * 1000).toISOString(),
            flows: flows,
            rules: rules,
            incidents: incidents,
            anomalies: anomalies,
            events: events,
            devices: devices,
            alerts: alerts,
            recentTransitions: recentTransitions,
            admin: admin,
            sourceStatus: sourceStatus
        };
    }

    global.WatchdogHub = global.WatchdogHub || {};
    global.WatchdogHub.createDemoDataset = createDemoDataset;
}(window));

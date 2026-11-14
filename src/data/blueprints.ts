import {
  CodeStyle,
  DagBlueprint,
  DagConfig,
  DagEdge,
  HistoricalDagRun,
  OperatorType,
  TaskNode,
  TaskState,
} from '../types/airflow';

export const OPERATOR_META: Record<
  OperatorType,
  {
    shortName: string;
    importPath: string;
    className: string;
    description: string;
    defaultPayload: string;
  }
> = {
  TaskFlow: {
    shortName: '@task',
    importPath: 'from airflow.decorators import task',
    className: '@task',
    description: 'Python function decorated with @task for automatic XCom passing.',
    defaultPayload: 'return {"records_processed": 14820, "status": "ok"}',
  },
  PythonOperator: {
    shortName: 'Python',
    importPath: 'from airflow.operators.python import PythonOperator',
    className: 'PythonOperator',
    description: 'Executes a Python callable with explicit context or op_kwargs.',
    defaultPayload: 'def run_step(**context):\n    ds = context["ds"]\n    print(f"Processing partition {ds}")',
  },
  BashOperator: {
    shortName: 'Bash',
    importPath: 'from airflow.operators.bash import BashOperator',
    className: 'BashOperator',
    description: 'Executes a shell command or CLI tool inside the worker environment.',
    defaultPayload: 'dbt run --select +mart_orders --vars \'{"run_date": "{{ ds }}"}\'',
  },
  SQLExecuteQueryOperator: {
    shortName: 'SQL',
    importPath: 'from airflow.providers.common.sql.operators.sql import SQLExecuteQueryOperator',
    className: 'SQLExecuteQueryOperator',
    description: 'Runs idempotent SQL transformations against a configured connection.',
    defaultPayload: 'DELETE FROM analytics.daily_orders WHERE order_date = \'{{ ds }}\';\nINSERT INTO analytics.daily_orders SELECT * FROM staging.orders WHERE order_date = \'{{ ds }}\';',
  },
  S3KeySensor: {
    shortName: 'Sensor',
    importPath: 'from airflow.providers.amazon.aws.sensors.s3 import S3KeySensor',
    className: 'S3KeySensor',
    description: 'Waits for an upstream S3 object using deferrable mode to free worker slots.',
    defaultPayload: 's3://raw-events-prod/orders/dt={{ ds }}/_SUCCESS',
  },
  BranchPythonOperator: {
    shortName: 'Branch',
    importPath: 'from airflow.operators.python import BranchPythonOperator',
    className: 'BranchPythonOperator',
    description: 'Evaluates data or metrics and returns downstream task_id(s) to execute.',
    defaultPayload: 'return "retrain_model" if drift_score > 0.15 else "skip_retraining"',
  },
  EmptyOperator: {
    shortName: 'Empty',
    importPath: 'from airflow.operators.empty import EmptyOperator',
    className: 'EmptyOperator',
    description: 'No-op synchronization barrier for fan-in or join points.',
    defaultPayload: 'Sync barrier — no execution payload',
  },
  TriggerDagRunOperator: {
    shortName: 'Trigger DAG',
    importPath: 'from airflow.operators.trigger_dagrun import TriggerDagRunOperator',
    className: 'TriggerDagRunOperator',
    description: 'Triggers a downstream decoupled DAG with explicit logical_date.',
    defaultPayload: 'trigger_dag_id="downstream_bi_refresh"',
  },
};

export const TASK_STATE_META: Record<
  TaskState,
  {
    label: string;
    bg: string;
    border: string;
    text: string;
    badgeBg: string;
  }
> = {
  none: {
    label: 'Idle',
    bg: 'bg-white',
    border: 'border-slate-300',
    text: 'text-slate-600',
    badgeBg: 'bg-slate-100',
  },
  scheduled: {
    label: 'Scheduled',
    bg: 'bg-sky-50',
    border: 'border-sky-300',
    text: 'text-sky-800',
    badgeBg: 'bg-sky-100',
  },
  queued: {
    label: 'Queued',
    bg: 'bg-slate-100',
    border: 'border-slate-400',
    text: 'text-slate-700',
    badgeBg: 'bg-slate-200',
  },
  running: {
    label: 'Running',
    bg: 'bg-teal-50',
    border: 'border-teal-500',
    text: 'text-teal-900',
    badgeBg: 'bg-teal-100',
  },
  up_for_retry: {
    label: 'Up for Retry',
    bg: 'bg-amber-50',
    border: 'border-amber-500',
    text: 'text-amber-900',
    badgeBg: 'bg-amber-100',
  },
  success: {
    label: 'Success',
    bg: 'bg-emerald-50',
    border: 'border-emerald-600',
    text: 'text-emerald-900',
    badgeBg: 'bg-emerald-100',
  },
  failed: {
    label: 'Failed',
    bg: 'bg-red-50',
    border: 'border-red-600',
    text: 'text-red-900',
    badgeBg: 'bg-red-100',
  },
  upstream_failed: {
    label: 'Upstream Failed',
    bg: 'bg-orange-50',
    border: 'border-orange-500',
    text: 'text-orange-900',
    badgeBg: 'bg-orange-100',
  },
  skipped: {
    label: 'Skipped',
    bg: 'bg-fuchsia-50',
    border: 'border-fuchsia-400',
    text: 'text-fuchsia-900',
    badgeBg: 'bg-fuchsia-100',
  },
};

export const BLUEPRINTS: DagBlueprint[] = [
  {
    id: 'ml_batch_prediction',
    name: 'ML Batch Prediction & Drift Scoring',
    summary: 'End-to-end daily batch inference pipeline: wait for Feature Store snapshot, validate feature contracts, load champion model URI, score predictions, check drift, and publish idempotently.',
    config: {
      dagId: 'ml_churn_batch_prediction',
      description: 'Daily batch ML prediction pipeline with feature validation and drift branching',
      schedule: '0 4 * * *',
      catchup: false,
      maxActiveRuns: 1,
      tags: ['ml-prediction', 'inference', 'feature-store'],
      owner: 'ml-platform',
    },
    tasks: [
      {
        id: 'wait_for_feature_snapshot',
        label: 'Wait for Feature Snapshot',
        operator: 'S3KeySensor',
        x: 35,
        y: 165,
        retries: 2,
        retryDelaySec: 30,
        triggerRule: 'all_success',
        pool: 'sensors_pool',
        durationMs: 1000,
        payload: 's3://feature-store/churn_features/dt={{ ds }}/_SUCCESS',
        simulateFail: false,
        xcomOutput: '{"feature_uri": "s3://feature-store/churn_features/dt=2026-11-14/part.parquet"}',
      },
      {
        id: 'validate_feature_schema',
        label: 'Validate Feature Quality',
        operator: 'PythonOperator',
        x: 280,
        y: 85,
        retries: 1,
        retryDelaySec: 15,
        triggerRule: 'all_success',
        pool: 'default_pool',
        durationMs: 1100,
        payload: 'assert_no_nulls(df, ["tenure_days", "mrr_30d", "support_tickets_7d"])',
        simulateFail: false,
        xcomOutput: '{"rows_validated": 284910, "null_violations": 0}',
      },
      {
        id: 'resolve_champion_model',
        label: 'Resolve Champion Model',
        operator: 'TaskFlow',
        x: 280,
        y: 245,
        retries: 2,
        retryDelaySec: 10,
        triggerRule: 'all_success',
        pool: 'default_pool',
        durationMs: 900,
        payload: 'return mlflow_client.get_model_version_by_alias("churn_xgb", "champion").source',
        simulateFail: false,
        xcomOutput: '{"model_uri": "models:/churn_xgb@champion", "version": 14}',
      },
      {
        id: 'score_batch_predictions',
        label: 'Run Batch Inference',
        operator: 'TaskFlow',
        x: 540,
        y: 165,
        retries: 2,
        retryDelaySec: 20,
        triggerRule: 'all_success',
        pool: 'inference_pool',
        durationMs: 1550,
        payload: 'return run_parquet_batch_scoring(features_uri, model_uri, out_dt="{{ ds }}")',
        simulateFail: false,
        xcomOutput: '{"predictions_uri": "s3://ml-predictions/churn/dt=2026-11-14/scores.parquet", "rows_scored": 284910, "psi_drift": 0.08}',
      },
      {
        id: 'check_prediction_drift',
        label: 'Evaluate Prediction Drift',
        operator: 'BranchPythonOperator',
        x: 795,
        y: 165,
        retries: 0,
        retryDelaySec: 5,
        triggerRule: 'all_success',
        pool: 'default_pool',
        durationMs: 850,
        payload: 'return "trigger_retraining_dag" if psi_drift > 0.15 else "publish_predictions_to_dw"',
        simulateFail: false,
        branchTarget: 'publish_predictions_to_dw',
        xcomOutput: '"publish_predictions_to_dw"',
      },
      {
        id: 'publish_predictions_to_dw',
        label: 'Publish Scores to DW',
        operator: 'SQLExecuteQueryOperator',
        x: 1055,
        y: 85,
        retries: 2,
        retryDelaySec: 15,
        triggerRule: 'all_success',
        pool: 'warehouse_write_pool',
        durationMs: 1200,
        payload: 'DELETE FROM ml.daily_churn_predictions WHERE score_date = \'{{ ds }}\';\nINSERT INTO ml.daily_churn_predictions SELECT customer_id, churn_prob, model_version, \'{{ ds }}\' FROM staged_scores;',
        simulateFail: false,
        xcomOutput: '{"rows_published": 284910}',
      },
      {
        id: 'trigger_retraining_dag',
        label: 'Trigger Retraining DAG',
        operator: 'TriggerDagRunOperator',
        x: 1055,
        y: 245,
        retries: 1,
        retryDelaySec: 15,
        triggerRule: 'all_success',
        pool: 'default_pool',
        durationMs: 850,
        payload: 'trigger_dag_id="churn_model_retraining"',
        simulateFail: false,
        xcomOutput: '{"triggered_dag_id": "churn_model_retraining"}',
      },
    ],
    edges: [
      { id: 'p1', source: 'wait_for_feature_snapshot', target: 'validate_feature_schema' },
      { id: 'p2', source: 'wait_for_feature_snapshot', target: 'resolve_champion_model' },
      { id: 'p3', source: 'validate_feature_schema', target: 'score_batch_predictions' },
      { id: 'p4', source: 'resolve_champion_model', target: 'score_batch_predictions' },
      { id: 'p5', source: 'score_batch_predictions', target: 'check_prediction_drift' },
      { id: 'p6', source: 'check_prediction_drift', target: 'publish_predictions_to_dw' },
      { id: 'p7', source: 'check_prediction_drift', target: 'trigger_retraining_dag' },
    ],
  },
  {
    id: 'ml_multi_region_inference',
    name: 'Multi-Region Parallel ML Inference',
    summary: 'Hydrates point-in-time features, fans out parallel inference across regional shards, and merges predictions into a serving mart.',
    config: {
      dagId: 'ml_multi_region_scoring',
      description: 'Parallelized regional ML batch scoring with idempotent warehouse merge',
      schedule: '0 */6 * * *',
      catchup: false,
      maxActiveRuns: 2,
      tags: ['ml-prediction', 'parallel', 'taskflow'],
      owner: 'ml-platform',
    },
    tasks: [
      {
        id: 'build_point_in_time_features',
        label: 'Build Point-in-Time Features',
        operator: 'SQLExecuteQueryOperator',
        x: 45,
        y: 165,
        retries: 2,
        retryDelaySec: 20,
        triggerRule: 'all_success',
        pool: 'warehouse_write_pool',
        durationMs: 1250,
        payload: 'CREATE OR REPLACE TABLE ml_staging.features_{{ ds_nodash }} AS SELECT * FROM feature_store WHERE event_ts < \'{{ data_interval_end }}\';',
        simulateFail: false,
        xcomOutput: '{"table": "ml_staging.features_20261114", "shards": ["us_east", "eu_west", "apac"]}',
      },
      {
        id: 'score_shard_us_east',
        label: 'Score Shard: US-East',
        operator: 'TaskFlow',
        x: 335,
        y: 45,
        retries: 2,
        retryDelaySec: 15,
        triggerRule: 'all_success',
        pool: 'inference_pool',
        durationMs: 1300,
        payload: 'return score_region_partition("us_east", "{{ data_interval_start }}")',
        simulateFail: false,
        xcomOutput: '{"region": "us_east", "scored": 148200}',
      },
      {
        id: 'score_shard_eu_west',
        label: 'Score Shard: EU-West',
        operator: 'TaskFlow',
        x: 335,
        y: 165,
        retries: 2,
        retryDelaySec: 15,
        triggerRule: 'all_success',
        pool: 'inference_pool',
        durationMs: 1150,
        payload: 'return score_region_partition("eu_west", "{{ data_interval_start }}")',
        simulateFail: false,
        xcomOutput: '{"region": "eu_west", "scored": 94120}',
      },
      {
        id: 'score_shard_apac',
        label: 'Score Shard: APAC',
        operator: 'TaskFlow',
        x: 335,
        y: 285,
        retries: 2,
        retryDelaySec: 15,
        triggerRule: 'all_success',
        pool: 'inference_pool',
        durationMs: 1050,
        payload: 'return score_region_partition("apac", "{{ data_interval_start }}")',
        simulateFail: false,
        xcomOutput: '{"region": "apac", "scored": 61840}',
      },
      {
        id: 'merge_prediction_mart',
        label: 'Merge Predictions & Audit',
        operator: 'SQLExecuteQueryOperator',
        x: 640,
        y: 165,
        retries: 1,
        retryDelaySec: 15,
        triggerRule: 'all_success',
        pool: 'warehouse_write_pool',
        durationMs: 1100,
        payload: 'MERGE INTO ml.live_propensity_scores t USING ml_staging.scores_{{ ds_nodash }} s ON t.entity_id = s.entity_id WHEN MATCHED THEN UPDATE SET score = s.score;',
        simulateFail: false,
        xcomOutput: '{"total_merged": 304160}',
      },
      {
        id: 'refresh_serving_cache',
        label: 'Warm Feature Serving Cache',
        operator: 'BashOperator',
        x: 925,
        y: 165,
        retries: 1,
        retryDelaySec: 10,
        triggerRule: 'all_success',
        pool: 'default_pool',
        durationMs: 900,
        payload: 'python scripts/sync_redis_predictions.py --ds {{ ds }}',
        simulateFail: false,
        xcomOutput: '{"redis_keys_updated": 304160}',
      },
    ],
    edges: [
      { id: 'r1', source: 'build_point_in_time_features', target: 'score_shard_us_east' },
      { id: 'r2', source: 'build_point_in_time_features', target: 'score_shard_eu_west' },
      { id: 'r3', source: 'build_point_in_time_features', target: 'score_shard_apac' },
      { id: 'r4', source: 'score_shard_us_east', target: 'merge_prediction_mart' },
      { id: 'r5', source: 'score_shard_eu_west', target: 'merge_prediction_mart' },
      { id: 'r6', source: 'score_shard_apac', target: 'merge_prediction_mart' },
      { id: 'r7', source: 'merge_prediction_mart', target: 'refresh_serving_cache' },
    ],
  },
  {
    id: 'ecommerce_etl',
    name: 'E-Commerce Daily ETL',
    summary: 'Layered ingestion from raw S3 partition through data quality checks into idempotent warehouse marts.',
    config: {
      dagId: 'ecommerce_orders_etl',
      description: 'Ingest, validate, and aggregate daily order partitions',
      schedule: '0 2 * * *',
      catchup: false,
      maxActiveRuns: 1,
      tags: ['commerce', 'warehouse', 'tier-1'],
      owner: 'data-platform',
    },
    tasks: [
      {
        id: 'wait_for_raw_orders',
        label: 'Wait for Raw Orders',
        operator: 'S3KeySensor',
        x: 40,
        y: 165,
        retries: 2,
        retryDelaySec: 30,
        triggerRule: 'all_success',
        pool: 'sensors_pool',
        durationMs: 1100,
        payload: 's3://raw-commerce/orders/dt={{ ds }}/_SUCCESS',
        simulateFail: false,
        xcomOutput: '{"bucket": "raw-commerce", "key": "orders/dt=2026-11-14"}',
      },
      {
        id: 'extract_orders',
        label: 'Extract Orders',
        operator: 'TaskFlow',
        x: 290,
        y: 85,
        retries: 2,
        retryDelaySec: 15,
        triggerRule: 'all_success',
        pool: 'default_pool',
        durationMs: 1300,
        payload: 'return stage_parquet_to_warehouse("orders", "{{ ds }}")',
        simulateFail: false,
        xcomOutput: '{"staged_uri": "s3://lake-staging/orders/2026-11-14.parquet", "rows": 42190}',
      },
      {
        id: 'extract_payments',
        label: 'Extract Payments',
        operator: 'TaskFlow',
        x: 290,
        y: 245,
        retries: 2,
        retryDelaySec: 15,
        triggerRule: 'all_success',
        pool: 'default_pool',
        durationMs: 1450,
        payload: 'return stage_parquet_to_warehouse("payments", "{{ ds }}")',
        simulateFail: false,
        xcomOutput: '{"staged_uri": "s3://lake-staging/payments/2026-11-14.parquet", "rows": 41984}',
      },
      {
        id: 'validate_schema_counts',
        label: 'Validate Data Quality',
        operator: 'PythonOperator',
        x: 545,
        y: 165,
        retries: 1,
        retryDelaySec: 10,
        triggerRule: 'all_success',
        pool: 'default_pool',
        durationMs: 1050,
        payload: 'assert orders_rows > 0 and null_rate < 0.01',
        simulateFail: false,
        xcomOutput: '{"dq_passed": true, "null_rate": 0.0004}',
      },
      {
        id: 'build_order_mart',
        label: 'Build Order Mart',
        operator: 'SQLExecuteQueryOperator',
        x: 795,
        y: 165,
        retries: 2,
        retryDelaySec: 20,
        triggerRule: 'all_success',
        pool: 'warehouse_write_pool',
        durationMs: 1500,
        payload: 'DELETE FROM mart.daily_orders WHERE dt = \'{{ ds }}\';\nINSERT INTO mart.daily_orders SELECT ...',
        simulateFail: false,
        xcomOutput: '{"rows_affected": 42190}',
      },
      {
        id: 'notify_pipeline_status',
        label: 'Publish Run Summary',
        operator: 'BashOperator',
        x: 1045,
        y: 165,
        retries: 0,
        retryDelaySec: 5,
        triggerRule: 'all_done',
        pool: 'default_pool',
        durationMs: 800,
        payload: 'python scripts/send_slack_summary.py --dag {{ dag.dag_id }} --ds {{ ds }}',
        simulateFail: false,
        xcomOutput: '{"notified_channel": "#data-ops"}',
      },
    ],
    edges: [
      { id: 'e1', source: 'wait_for_raw_orders', target: 'extract_orders' },
      { id: 'e2', source: 'wait_for_raw_orders', target: 'extract_payments' },
      { id: 'e3', source: 'extract_orders', target: 'validate_schema_counts' },
      { id: 'e4', source: 'extract_payments', target: 'validate_schema_counts' },
      { id: 'e5', source: 'validate_schema_counts', target: 'build_order_mart' },
      { id: 'e6', source: 'build_order_mart', target: 'notify_pipeline_status' },
    ],
  },
  {
    id: 'ml_branching',
    name: 'ML Drift Check & Branching',
    summary: 'Demonstrates BranchPythonOperator conditional routing, skipped states, and none_failed_min_one_success joins.',
    config: {
      dagId: 'churn_model_retraining',
      description: 'Compute feature drift and conditionally retrain XGBoost model',
      schedule: '@weekly',
      catchup: false,
      maxActiveRuns: 1,
      tags: ['mlops', 'branching', 'taskflow'],
      owner: 'ml-engineering',
    },
    tasks: [
      {
        id: 'compute_feature_stats',
        label: 'Compute Feature Stats',
        operator: 'TaskFlow',
        x: 50,
        y: 165,
        retries: 1,
        retryDelaySec: 15,
        triggerRule: 'all_success',
        pool: 'default_pool',
        durationMs: 1200,
        payload: 'return compute_psi_drift(window_days=7)',
        simulateFail: false,
        xcomOutput: '{"psi_score": 0.24, "threshold": 0.15}',
      },
      {
        id: 'evaluate_drift_branch',
        label: 'Evaluate Drift Branch',
        operator: 'BranchPythonOperator',
        x: 310,
        y: 165,
        retries: 0,
        retryDelaySec: 5,
        triggerRule: 'all_success',
        pool: 'default_pool',
        durationMs: 850,
        payload: 'return "retrain_churn_model" if psi > 0.15 else "keep_existing_model"',
        simulateFail: false,
        branchTarget: 'retrain_churn_model',
        xcomOutput: '"retrain_churn_model"',
      },
      {
        id: 'retrain_churn_model',
        label: 'Retrain Churn Model',
        operator: 'TaskFlow',
        x: 580,
        y: 75,
        retries: 2,
        retryDelaySec: 30,
        triggerRule: 'all_success',
        pool: 'gpu_training_pool',
        durationMs: 1700,
        payload: 'return train_and_register_model(dataset_dt="{{ ds }}")',
        simulateFail: false,
        xcomOutput: '{"model_version": "v14", "auc": 0.914}',
      },
      {
        id: 'keep_existing_model',
        label: 'Keep Existing Model',
        operator: 'EmptyOperator',
        x: 580,
        y: 255,
        retries: 0,
        retryDelaySec: 5,
        triggerRule: 'all_success',
        pool: 'default_pool',
        durationMs: 650,
        payload: 'No-op branch when drift is below threshold',
        simulateFail: false,
      },
      {
        id: 'update_model_registry_tags',
        label: 'Sync Model Registry',
        operator: 'PythonOperator',
        x: 860,
        y: 165,
        retries: 1,
        retryDelaySec: 10,
        triggerRule: 'none_failed_min_one_success',
        pool: 'default_pool',
        durationMs: 950,
        payload: 'tag_production_champion(run_id="{{ run_id }}")',
        simulateFail: false,
        xcomOutput: '{"champion_updated": true}',
      },
    ],
    edges: [
      { id: 'm1', source: 'compute_feature_stats', target: 'evaluate_drift_branch' },
      { id: 'm2', source: 'evaluate_drift_branch', target: 'retrain_churn_model' },
      { id: 'm3', source: 'evaluate_drift_branch', target: 'keep_existing_model' },
      { id: 'm4', source: 'retrain_churn_model', target: 'update_model_registry_tags' },
      { id: 'm5', source: 'keep_existing_model', target: 'update_model_registry_tags' },
    ],
  },
  {
    id: 'lakehouse_dbt',
    name: 'Lakehouse dbt + Downstream Trigger',
    summary: 'Multi-source ingestion fan-in with dbt build, data tests, and decoupled TriggerDagRunOperator.',
    config: {
      dagId: 'lakehouse_core_models',
      description: 'Run bronze-to-gold dbt transformations and trigger BI cache warmers',
      schedule: '0 */6 * * *',
      catchup: false,
      maxActiveRuns: 2,
      tags: ['dbt', 'lakehouse', 'analytics'],
      owner: 'analytics-eng',
    },
    tasks: [
      {
        id: 'ingest_clickstream',
        label: 'Ingest Clickstream',
        operator: 'TaskFlow',
        x: 55,
        y: 75,
        retries: 2,
        retryDelaySec: 20,
        triggerRule: 'all_success',
        pool: 'ingestion_pool',
        durationMs: 1200,
        payload: 'return load_kafka_snapshot("clickstream", "{{ data_interval_start }}")',
        simulateFail: false,
        xcomOutput: '{"partition": "2026-11-14T06:00", "events": 182400}',
      },
      {
        id: 'ingest_crm_accounts',
        label: 'Ingest CRM Accounts',
        operator: 'TaskFlow',
        x: 55,
        y: 255,
        retries: 2,
        retryDelaySec: 20,
        triggerRule: 'all_success',
        pool: 'ingestion_pool',
        durationMs: 1050,
        payload: 'return sync_salesforce_incremental("{{ ds }}")',
        simulateFail: false,
        xcomOutput: '{"updated_accounts": 932}',
      },
      {
        id: 'dbt_run_silver',
        label: 'dbt Run Silver Layer',
        operator: 'BashOperator',
        x: 335,
        y: 165,
        retries: 1,
        retryDelaySec: 30,
        triggerRule: 'all_success',
        pool: 'dbt_pool',
        durationMs: 1500,
        payload: 'dbt run --select tag:silver --target prod',
        simulateFail: false,
        xcomOutput: '{"models_built": 18}',
      },
      {
        id: 'dbt_test_contracts',
        label: 'dbt Test Contracts',
        operator: 'BashOperator',
        x: 605,
        y: 165,
        retries: 0,
        retryDelaySec: 10,
        triggerRule: 'all_success',
        pool: 'dbt_pool',
        durationMs: 1150,
        payload: 'dbt test --select tag:silver --store-failures',
        simulateFail: false,
        xcomOutput: '{"tests_passed": 64, "tests_failed": 0}',
      },
      {
        id: 'trigger_bi_refresh',
        label: 'Trigger BI Refresh DAG',
        operator: 'TriggerDagRunOperator',
        x: 875,
        y: 165,
        retries: 1,
        retryDelaySec: 15,
        triggerRule: 'all_success',
        pool: 'default_pool',
        durationMs: 850,
        payload: 'trigger_dag_id="executive_bi_cache_warmer"',
        simulateFail: false,
        xcomOutput: '{"triggered_run_id": "manual__2026-11-14T06:12:00"}',
      },
    ],
    edges: [
      { id: 'd1', source: 'ingest_clickstream', target: 'dbt_run_silver' },
      { id: 'd2', source: 'ingest_crm_accounts', target: 'dbt_run_silver' },
      { id: 'd3', source: 'dbt_run_silver', target: 'dbt_test_contracts' },
      { id: 'd4', source: 'dbt_test_contracts', target: 'trigger_bi_refresh' },
    ],
  },
];

export function generateHistoricalRuns(tasks: TaskNode[]): HistoricalDagRun[] {
  const dates = [
    { runId: 'scheduled__2026-11-10T02:00:00', logicalDate: '2026-11-10 02:00 UTC', failIndex: -1 },
    { runId: 'scheduled__2026-11-11T02:00:00', logicalDate: '2026-11-11 02:00 UTC', failIndex: 2 },
    { runId: 'scheduled__2026-11-12T02:00:00', logicalDate: '2026-11-12 02:00 UTC', failIndex: -1 },
    { runId: 'scheduled__2026-11-13T02:00:00', logicalDate: '2026-11-13 02:00 UTC', failIndex: -1 },
  ];

  return dates.map((d, runIdx) => {
    const taskStates: Record<string, { state: TaskState; durationSec: number }> = {};
    let totalDuration = 0;

    tasks.forEach((task, idx) => {
      const baseSec = Math.round((task.durationMs / 100) * (1 + ((runIdx + idx) % 3) * 0.14));
      if (d.failIndex !== -1 && idx === d.failIndex) {
        taskStates[task.id] = { state: 'failed', durationSec: baseSec };
        totalDuration += baseSec;
      } else if (d.failIndex !== -1 && idx > d.failIndex) {
        taskStates[task.id] = {
          state: task.triggerRule === 'all_done' ? 'success' : 'upstream_failed',
          durationSec: task.triggerRule === 'all_done' ? 3 : 0,
        };
      } else {
        taskStates[task.id] = { state: 'success', durationSec: baseSec };
        totalDuration += baseSec;
      }
    });

    return {
      runId: d.runId,
      logicalDate: d.logicalDate,
      state: d.failIndex === -1 ? 'success' : 'failed',
      durationSec: totalDuration,
      taskStates,
    };
  });
}

function sanitizeIdentifier(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1');
}

export function generateDagPythonCode(
  config: DagConfig,
  tasks: TaskNode[],
  edges: DagEdge[],
  style: CodeStyle
): string {
  const lines: string[] = [];
  const usedOperators = new Set(tasks.map((t) => t.operator));

  lines.push('from __future__ import annotations');
  lines.push('');
  lines.push('from datetime import datetime, timedelta');
  if (style === 'taskflow') {
    lines.push('from airflow.decorators import dag, task');
  } else {
    lines.push('from airflow import DAG');
  }

  usedOperators.forEach((op) => {
    if (op === 'TaskFlow' && style === 'taskflow') return;
    if (op === 'TaskFlow' && style === 'classic') {
      lines.push('from airflow.operators.python import PythonOperator');
      return;
    }
    lines.push(OPERATOR_META[op].importPath);
  });

  lines.push('');
  lines.push('default_args = {');
  lines.push(`    "owner": "${config.owner}",`);
  lines.push('    "depends_on_past": False,');
  lines.push('    "retries": 1,');
  lines.push('    "retry_delay": timedelta(minutes=5),');
  lines.push('}');
  lines.push('');

  const tagsStr = config.tags.map((t) => `"${t}"`).join(', ');

  if (style === 'taskflow') {
    lines.push('@dag(');
    lines.push(`    dag_id="${config.dagId}",`);
    lines.push(`    description="${config.description}",`);
    lines.push(`    schedule="${config.schedule}",`);
    lines.push('    start_date=datetime(2026, 1, 1),');
    lines.push(`    catchup=${config.catchup ? 'True' : 'False'},`);
    lines.push(`    max_active_runs=${config.maxActiveRuns},`);
    lines.push(`    tags=[${tagsStr}],`);
    lines.push('    default_args=default_args,');
    lines.push(')');
    lines.push(`def ${sanitizeIdentifier(config.dagId)}():`);

    const varNames: Record<string, string> = {};

    tasks.forEach((t) => {
      const fnName = sanitizeIdentifier(t.id);
      if (t.operator === 'TaskFlow') {
        const varName = `${fnName}_result`;
        varNames[t.id] = varName;
        lines.push(`    @task(`);
        lines.push(`        task_id="${t.id}",`);
        lines.push(`        retries=${t.retries},`);
        lines.push(`        retry_delay=timedelta(seconds=${t.retryDelaySec}),`);
        if (t.triggerRule !== 'all_success') {
          lines.push(`        trigger_rule="${t.triggerRule}",`);
        }
        if (t.pool !== 'default_pool') {
          lines.push(`        pool="${t.pool}",`);
        }
        lines.push('    )');
        lines.push(`    def ${fnName}(ds: str | None = None):`);
        t.payload.split('\n').forEach((pLine) => {
          lines.push(`        ${pLine}`);
        });
        lines.push('');
      } else {
        varNames[t.id] = fnName;
        lines.push(...renderClassicTaskBlock(t, '    '));
        lines.push('');
      }
    });

    // TaskFlow invocations
    tasks.forEach((t) => {
      if (t.operator === 'TaskFlow') {
        const fnName = sanitizeIdentifier(t.id);
        lines.push(`    ${varNames[t.id]} = ${fnName}()`);
      }
    });

    if (edges.length > 0) {
      lines.push('');
      edges.forEach((e) => {
        const src = varNames[e.source] || sanitizeIdentifier(e.source);
        const tgt = varNames[e.target] || sanitizeIdentifier(e.target);
        lines.push(`    ${src} >> ${tgt}`);
      });
    }

    lines.push('');
    lines.push(`${sanitizeIdentifier(config.dagId)}()`);
  } else {
    lines.push('with DAG(');
    lines.push(`    dag_id="${config.dagId}",`);
    lines.push(`    description="${config.description}",`);
    lines.push(`    schedule="${config.schedule}",`);
    lines.push('    start_date=datetime(2026, 1, 1),');
    lines.push(`    catchup=${config.catchup ? 'True' : 'False'},`);
    lines.push(`    max_active_runs=${config.maxActiveRuns},`);
    lines.push(`    tags=[${tagsStr}],`);
    lines.push('    default_args=default_args,');
    lines.push(') as dag:');

    tasks.forEach((t) => {
      lines.push(...renderClassicTaskBlock(t, '    '));
      lines.push('');
    });

    if (edges.length > 0) {
      edges.forEach((e) => {
        lines.push(
          `    ${sanitizeIdentifier(e.source)} >> ${sanitizeIdentifier(e.target)}`
        );
      });
    }
  }

  return lines.join('\n');
}

function renderClassicTaskBlock(t: TaskNode, indent: string): string[] {
  const varName = sanitizeIdentifier(t.id);
  const out: string[] = [];
  const commonProps = [
    `${indent}    task_id="${t.id}",`,
    `${indent}    retries=${t.retries},`,
    `${indent}    retry_delay=timedelta(seconds=${t.retryDelaySec}),`,
  ];
  if (t.triggerRule !== 'all_success') {
    commonProps.push(`${indent}    trigger_rule="${t.triggerRule}",`);
  }
  if (t.pool !== 'default_pool') {
    commonProps.push(`${indent}    pool="${t.pool}",`);
  }

  switch (t.operator) {
    case 'BashOperator':
      out.push(`${indent}${varName} = BashOperator(`);
      out.push(...commonProps);
      out.push(`${indent}    bash_command=${JSON.stringify(t.payload)},`);
      out.push(`${indent})`);
      break;
    case 'SQLExecuteQueryOperator':
      out.push(`${indent}${varName} = SQLExecuteQueryOperator(`);
      out.push(...commonProps);
      out.push(`${indent}    conn_id="warehouse_postgres",`);
      out.push(`${indent}    sql="""\n${t.payload}\n${indent}    """,`);
      out.push(`${indent})`);
      break;
    case 'S3KeySensor':
      out.push(`${indent}${varName} = S3KeySensor(`);
      out.push(...commonProps);
      out.push(`${indent}    bucket_key=${JSON.stringify(t.payload)},`);
      out.push(`${indent}    aws_conn_id="aws_default",`);
      out.push(`${indent}    deferrable=True,`);
      out.push(`${indent}    poke_interval=60,`);
      out.push(`${indent})`);
      break;
    case 'BranchPythonOperator':
      out.push(`${indent}${varName} = BranchPythonOperator(`);
      out.push(...commonProps);
      out.push(`${indent}    python_callable=lambda **ctx: ${JSON.stringify(t.branchTarget || 'next_step')},`);
      out.push(`${indent})`);
      break;
    case 'EmptyOperator':
      out.push(`${indent}${varName} = EmptyOperator(`);
      out.push(...commonProps);
      out.push(`${indent})`);
      break;
    case 'TriggerDagRunOperator':
      out.push(`${indent}${varName} = TriggerDagRunOperator(`);
      out.push(...commonProps);
      out.push(`${indent}    trigger_dag_id="executive_bi_cache_warmer",`);
      out.push(`${indent}    wait_for_completion=False,`);
      out.push(`${indent})`);
      break;
    default:
      out.push(`${indent}${varName} = PythonOperator(`);
      out.push(...commonProps);
      out.push(`${indent}    python_callable=lambda **ctx: print("Running ${t.id}"),`);
      out.push(`${indent})`);
      break;
  }

  return out;
}

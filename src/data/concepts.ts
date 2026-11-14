export interface ArchitectureNode {
  id: string;
  name: string;
  role: string;
  responsibilities: string[];
  configSnippet: string;
  connections: string[];
}

export const ARCHITECTURE_NODES: ArchitectureNode[] = [
  {
    id: 'dag_folder',
    name: 'DAG Files (.py)',
    role: 'Declarative pipeline definitions stored in Git and synced to Airflow.',
    responsibilities: [
      'Defines task graphs, schedules, retries, and operator parameters as pure Python.',
      'Parsed continuously by the DAG Processor—avoid top-level DB queries or heavy imports.',
    ],
    configSnippet: 'AIRFLOW__CORE__DAGS_FOLDER=/opt/airflow/dags\nAIRFLOW__SCHEDULER__DAG_DIR_LIST_INTERVAL=300',
    connections: ['scheduler'],
  },
  {
    id: 'scheduler',
    name: 'Scheduler & DAG Processor',
    role: 'Heart of Airflow: parses DAGs, creates DagRuns, and schedules TaskInstances.',
    responsibilities: [
      'Evaluates cron / timetable schedules to spawn DagRuns at the end of each data interval.',
      'Resolves upstream dependencies & trigger rules, moving eligible tasks to scheduled -> queued.',
      'Monitors task heartbeats and triggers retries when workers crash or tasks fail.',
    ],
    configSnippet: 'AIRFLOW__SCHEDULER__PARSING_PROCESSES=4\nAIRFLOW__CORE__MAX_ACTIVE_TASKS_PER_DAG=16',
    connections: ['metadata_db', 'executor'],
  },
  {
    id: 'metadata_db',
    name: 'Metadata Database',
    role: 'PostgreSQL / MySQL source of truth for all state, variables, connections, and XComs.',
    responsibilities: [
      'Stores DagRun states, TaskInstance states, Pools, Variables, and encrypted Connections.',
      'Acts as the coordination lock between Scheduler, Triggerer, Webserver, and Workers.',
    ],
    configSnippet: 'AIRFLOW__DATABASE__SQL_ALCHEMY_CONN=postgresql+psycopg2://airflow:***@postgres:5432/airflow',
    connections: ['webserver', 'triggerer', 'executor'],
  },
  {
    id: 'executor',
    name: 'Executor & Workers',
    role: 'Dispatches queued TaskInstances to compute processes, Celery queues, or Kubernetes Pods.',
    responsibilities: [
      'LocalExecutor: Spawns subprocesses on a single machine (great for dev or small workloads).',
      'CeleryExecutor: Distributes tasks across autoscaling worker nodes via Redis/RabbitMQ.',
      'KubernetesExecutor: Launches an isolated, ephemeral K8s Pod per TaskInstance.',
    ],
    configSnippet: 'AIRFLOW__CORE__EXECUTOR=KubernetesExecutor\nAIRFLOW__KUBERNETES_EXECUTOR__WORKER_CONTAINER_REPOSITORY=apache/airflow',
    connections: ['metadata_db'],
  },
  {
    id: 'triggerer',
    name: 'Triggerer (Asyncio)',
    role: 'Runs deferrable sensors & operators efficiently inside a single async event loop.',
    responsibilities: [
      'Frees worker slots while waiting on external events (S3 keys, Databricks jobs, BigQuery loads).',
      'Resumes the TaskInstance on a worker only after the async trigger condition fires.',
    ],
    configSnippet: 'AIRFLOW__TRIGGERER__DEFAULT_CAPACITY=1000\n# Set deferrable=True on Sensors',
    connections: ['metadata_db'],
  },
  {
    id: 'webserver',
    name: 'Webserver / API Server',
    role: 'Serves the Airflow UI, REST API, task logs, and RBAC authentication.',
    responsibilities: [
      'Reads DagRun/TaskInstance state exclusively from the Metadata Database (never runs tasks).',
      'Streams remote task logs from S3/GCS/Blob storage for debugging failed runs.',
    ],
    configSnippet: 'AIRFLOW__LOGGING__REMOTE_LOGGING=True\nAIRFLOW__LOGGING__REMOTE_BASE_LOG_FOLDER=s3://airflow-logs/prod',
    connections: ['metadata_db'],
  },
];

export interface ExecutorComparison {
  name: string;
  architecture: string;
  scaling: string;
  isolation: string;
  bestFor: string;
}

export const EXECUTOR_COMPARISONS: ExecutorComparison[] = [
  {
    name: 'SequentialExecutor',
    architecture: 'Single process with SQLite',
    scaling: '1 task at a time (no parallelism)',
    isolation: 'None (shared process)',
    bestFor: 'Local laptop unit testing only',
  },
  {
    name: 'LocalExecutor',
    architecture: 'Multiprocessing on single host + Postgres',
    scaling: 'Vertical (bounded by host CPU/RAM)',
    isolation: 'OS subprocess per task',
    bestFor: 'Small teams (< 50 DAGs, single VM)',
  },
  {
    name: 'CeleryExecutor',
    architecture: 'Broker (Redis/RabbitMQ) + long-lived worker pool',
    scaling: 'Horizontal via KEDA / worker autoscaling',
    isolation: 'Shared Python environment per queue',
    bestFor: 'High-throughput, low-latency short tasks',
  },
  {
    name: 'KubernetesExecutor',
    architecture: '1 TaskInstance = 1 ephemeral Kubernetes Pod',
    scaling: 'Horizontal cluster autoscaling per task',
    isolation: 'Full container image, CPU/RAM, & IAM per task',
    bestFor: 'Heterogeneous workloads, ML, & strict isolation',
  },
];

export interface PatternCase {
  id: string;
  title: string;
  category: 'ML Inference' | 'Parsing' | 'Idempotency' | 'XComs' | 'Sensors';
  impact: string;
  antiPatternTitle: string;
  antiPatternCode: string;
  antiPatternWhy: string;
  productionTitle: string;
  productionCode: string;
  productionWhy: string;
}

export const PRODUCTION_PATTERNS: PatternCase[] = [
  {
    id: 'ml_model_xcom',
    title: 'Pass Model Registry URIs Instead of Model Weights',
    category: 'ML Inference',
    impact: 'Prevents worker OOMs and keeps XCom metadata tiny.',
    antiPatternTitle: 'Loading & returning a 400MB model object between tasks',
    antiPatternCode: `@task
def load_model():
    model = mlflow.xgboost.load_model("models:/churn/Production")
    # Fails: XGBoost/PyTorch models are not JSON-serializable
    # and blow up Metadata DB limits if pickled into XCom!
    return model

@task
def predict(model, features_uri: str):
    return model.predict(pd.read_parquet(features_uri))`,
    antiPatternWhy:
      'Airflow XComs are designed for small JSON metadata, not serialized ML artifacts. Pickling large models into Postgres causes serialization errors and worker memory exhaustion.',
    productionTitle: 'Resolve only the Model URI/version and load inside inference',
    productionCode: `@task
def resolve_champion_uri() -> dict[str, str]:
    mv = MlflowClient().get_model_version_by_alias("churn_xgb", "champion")
    return {"model_uri": f"models:/churn_xgb/{mv.version}", "version": mv.version}

@task(pool="inference_pool")
def score_batch(model_meta: dict[str, str], features_uri: str, ds: str) -> str:
    model = mlflow.pyfunc.load_model(model_meta["model_uri"])
    df = pd.read_parquet(features_uri)
    df["churn_prob"] = model.predict(df[FEATURE_COLS])
    out_uri = f"s3://ml-predictions/churn/dt={ds}/scores.parquet"
    df[["customer_id", "churn_prob"]].to_parquet(out_uri)
    return out_uri`,
    productionWhy:
      'Only a tiny URI string crosses XCom while workers load the pinned model version directly from artifact storage inside a dedicated inference pool.',
  },
  {
    id: 'ml_point_in_time',
    title: 'Enforce Point-in-Time Feature Cutoffs for Inference',
    category: 'ML Inference',
    impact: 'Eliminates data leakage and ensures reproducible backfills.',
    antiPatternTitle: 'Querying unpinned CURRENT_TIMESTAMP feature tables',
    antiPatternCode: `build_features = SQLExecuteQueryOperator(
    task_id="build_features",
    sql="""
        CREATE TABLE tmp_features AS
        SELECT user_id, COUNT(*) AS orders_30d
        FROM raw.orders
        -- Leaks future orders if retried or backfilled!
        WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
    """
)`,
    antiPatternWhy:
      'If a prediction pipeline fails and is re-run two days later, CURRENT_TIMESTAMP pulls future events that had not occurred on the prediction date—corrupting backfills and skewing offline evaluation.',
    productionTitle: 'Anchor rolling feature windows to {{ data_interval_end }}',
    productionCode: `build_features = SQLExecuteQueryOperator(
    task_id="build_features",
    sql="""
        CREATE OR REPLACE TABLE ml_staging.features_{{ ds_nodash }} AS
        SELECT user_id, COUNT(*) AS orders_30d
        FROM raw.orders
        WHERE created_at >= TIMESTAMP '{{ data_interval_end }}' - INTERVAL '30 days'
          AND created_at <  TIMESTAMP '{{ data_interval_end }}'
        GROUP BY user_id;
    """
)`,
    productionWhy:
      'Anchoring every feature window to Airflow’s data_interval_end guarantees identical feature vectors whether the DAG runs on schedule or during a historical backfill.',
  },
  {
    id: 'top_level_code',
    title: 'Avoid Top-Level Database & API Calls',
    category: 'Parsing',
    impact: 'Scheduler parses every DAG file every 30s–60s.',
    antiPatternTitle: 'Top-level query runs on every scheduler heartbeat',
    antiPatternCode: `from airflow.decorators import dag, task
from airflow.models import Variable
import requests

# Executed EVERY 30 seconds by the Scheduler!
API_TOKEN = Variable.get("prod_api_token")
PARTNERS = requests.get("https://api.internal/partners").json()

@dag(schedule="@daily")
def sync_partners():
    for p in PARTNERS:
        @task(task_id=f"sync_{p}")
        def run(): ...`,
    antiPatternWhy:
      'Every scheduler parse loop opens a Metadata DB connection and makes an external HTTP call. If the API slows down, the entire Airflow Scheduler stalls and misses SLAs.',
    productionTitle: 'Defer Variable/API lookups inside @task execution',
    productionCode: `from airflow.decorators import dag, task
from airflow.models import Variable
import requests

@dag(schedule="@daily")
def sync_partners():
    @task
    def fetch_partners() -> list[str]:
        token = Variable.get("prod_api_token")
        return requests.get("https://api.internal/partners").json()

    @task
    def sync_partner(partner_id: str):
        ...

    sync_partner.expand(partner_id=fetch_partners())`,
    productionWhy:
      'DAG parsing stays sub-50ms with zero external I/O. Dynamic Task Mapping (.expand) cleanly fans out tasks at runtime on workers.',
  },
  {
    id: 'idempotency',
    title: 'Write Idempotent Partitioned Loads',
    category: 'Idempotency',
    impact: 'Safe backfills and retries without duplicate rows.',
    antiPatternTitle: 'Blind INSERT with datetime.now() breaks on retry',
    antiPatternCode: `@task
def load_daily_orders():
    # Using now() makes backfills impossible!
    today = datetime.now().strftime("%Y-%m-%d")
    db.execute("""
        INSERT INTO mart.orders
        SELECT * FROM staging.orders
        WHERE created_at >= CURRENT_DATE
    """)`,
    antiPatternWhy:
      'If the task fails halfway and retries, or you backfill last Tuesday, datetime.now() processes today instead of the failed logical date—and duplicates existing rows.',
    productionTitle: 'Delete-Write or MERGE scoped to {{ ds }} interval',
    productionCode: `load_daily_orders = SQLExecuteQueryOperator(
    task_id="load_daily_orders",
    conn_id="warehouse_postgres",
    sql="""
        BEGIN;
        DELETE FROM mart.orders
        WHERE order_date = '{{ ds }}';

        INSERT INTO mart.orders
        SELECT * FROM staging.orders
        WHERE order_date >= '{{ data_interval_start }}'
          AND order_date <  '{{ data_interval_end }}';
        COMMIT;
    """,
)`,
    productionWhy:
      'Scoping every write to {{ data_interval_start }} and {{ data_interval_end }} inside a transaction guarantees clearing and re-running any past date yields the exact same output.',
  },
  {
    id: 'xcom_size',
    title: 'Pass References via XCom, Not Large Payloads',
    category: 'XComs',
    impact: 'Prevents Metadata DB bloat and serialization crashes.',
    antiPatternTitle: 'Returning a 500MB DataFrame directly through XCom',
    antiPatternCode: `@task
def extract_events():
    df = pd.read_parquet("s3://raw/events.parquet")
    # Serializes entire DataFrame into Postgres xcom table!
    return df.to_dict()

@task
def transform(events_dict):
    df = pd.DataFrame(events_dict)
    ...`,
    antiPatternWhy:
      'XComs are stored in the Airflow Metadata Database (often capped at 48KB–1MB depending on DB/backend). Pushing megabytes bloats Postgres and crashes workers with OOM.',
    productionTitle: 'Write data to Object Storage and pass only the URI',
    productionCode: `@task
def extract_events(ds: str) -> str:
    df = pd.read_parquet(f"s3://raw/events/dt={ds}.parquet")
    out_uri = f"s3://lake-staging/clean_events/dt={ds}.parquet"
    df.to_parquet(out_uri)
    return out_uri  # Tiny 60-byte XCom pointer

@task
def transform(staged_uri: str):
    df = pd.read_parquet(staged_uri)
    ...`,
    productionWhy:
      'Metadata DB stores only lightweight metadata strings while S3/GCS handles bulk columnar data efficiently.',
  },
  {
    id: 'deferrable_sensors',
    title: 'Use Deferrable Sensors Instead of Blocking Poke Mode',
    category: 'Sensors',
    impact: 'Eliminates worker slot starvation during upstream delays.',
    antiPatternTitle: 'Default poke sensor holds a full worker slot idle',
    antiPatternCode: `wait_for_file = S3KeySensor(
    task_id="wait_for_file",
    bucket_key="s3://vendor-drops/{{ ds }}/feed.csv",
    mode="poke",          # Worker sleeps for hours!
    poke_interval=60,
    timeout=60 * 60 * 6,
)`,
    antiPatternWhy:
      'If 20 DAGs wait 4 hours for upstream vendor files in poke mode, 20 worker processes sit completely idle—starving critical transformation tasks.',
    productionTitle: 'Enable deferrable=True to offload waiting to Triggerer',
    productionCode: `wait_for_file = S3KeySensor(
    task_id="wait_for_file",
    bucket_key="s3://vendor-drops/{{ ds }}/feed.csv",
    deferrable=True,      # Offloads to async Triggerer
    poke_interval=60,
    timeout=60 * 60 * 6,
)`,
    productionWhy:
      'The worker releases immediately after registering the async trigger. A single Triggerer process can watch thousands of files simultaneously.',
  },
];

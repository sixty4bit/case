/** Status lifecycle — mirrors task-status.sh TRANSITIONS map */
export type TaskStatus =
  | 'active'
  | 'implementing'
  | 'verifying'
  | 'reviewing'
  | 'closing'
  | 'pr-opened'
  | 'merged';

export type AgentName =
  | 'orchestrator'
  | 'implementer'
  | 'verifier'
  | 'reviewer'
  | 'closer';

export interface AgentPhase {
  started: string | null;
  completed: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

export interface TaskJson {
  id: string;
  status: TaskStatus;
  created: string;
  repo: string;
  issue?: string;
  issueType?: 'github' | 'linear' | 'freeform' | 'ideation';
  contractPath?: string | null;
  branch?: string;
  mode?: PipelineMode;
  agents: Partial<Record<AgentName, AgentPhase>>;
  tested: boolean;
  manualTested: boolean;
  prUrl: string | null;
  prNumber: number | null;
  fastTestCommand?: string | null;
  checkCommand?: string | null;
  checkBaseline?: number | null;
  checkTarget?: number | null;
}

/** Matches SKILL.md Subagent Output Contract */
export interface AgentResult {
  status: 'completed' | 'failed' | 'blocked';
  summary: string;
  artifacts: {
    commit: string | null;
    filesChanged: string[];
    testsPassed: boolean | null;
    screenshotUrls: string[];
    evidenceMarkers: string[];
    prUrl: string | null;
    prNumber: number | null;
  };
  findings?: ReviewFindings;
  error: string | null;
}

export interface ReviewFindings {
  critical: number;
  warnings: number;
  info: number;
  details: Array<{
    severity: string;
    principle: string;
    message: string;
    file: string;
    line: number | null;
  }>;
}

export type PipelineMode = 'attended' | 'unattended';

export type PipelinePhase =
  | 'implement'
  | 'verify'
  | 'review'
  | 'close'
  | 'retrospective'
  | 'complete'
  | 'abort';

export interface PipelineConfig {
  mode: PipelineMode;
  taskJsonPath: string;
  taskMdPath: string;
  repoPath: string;
  repoName: string;
  caseRoot: string;
  maxRetries: number;
  dryRun: boolean;
}

export interface ProjectEntry {
  name: string;
  path: string;
  remote: string;
  description?: string;
  language: string;
  packageManager: string;
  commands: Record<string, string>;
}

export interface FailureAnalysis {
  failureClass: string;
  failedAgent: string;
  errorSummary: string;
  filesInvolved: string[];
  whatWasTried: string[];
  suggestedFocus: string;
  retryViable: boolean;
}

export interface PhaseOutput {
  result: AgentResult;
  nextPhase: PipelinePhase;
}

export interface SpawnAgentOptions {
  prompt: string;
  cwd: string;
  timeout?: number;
  background?: boolean;
}

export interface SpawnAgentResult {
  raw: string;
  result: AgentResult;
  durationMs: number;
}

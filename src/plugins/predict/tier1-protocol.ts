/** Message protocol shared between the Tier 1 controller and its worker. */

export interface InitMsg {
  type: 'init';
  model: string;
  /** transformers.js dtype, e.g. 'q4' | 'q8' | 'fp16'. */
  dtype: string;
  maxNewTokens: number;
}

export interface SuggestMsg {
  type: 'suggest';
  id: number;
  context: string;
}

export type ToWorker = InitMsg | SuggestMsg;

export interface ProgressMsg {
  type: 'progress';
  loaded: number;
  total: number;
  /** 0..1 across all model files being fetched. */
  pct: number;
}
export interface ReadyMsg {
  type: 'ready';
}
export interface ErrorMsg {
  type: 'error';
  message: string;
}
export interface ResultMsg {
  type: 'result';
  id: number;
  text: string;
}

export type FromWorker = ProgressMsg | ReadyMsg | ErrorMsg | ResultMsg;

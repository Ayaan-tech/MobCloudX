import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type MutableRefObject,
  type PropsWithChildren,
} from 'react';

export enum SDKMode {
  OTT = 'ott',
  WEBRTC = 'webrtc',
}

export interface AgentController {
  id: string;
  kind: SDKMode;
  pause?: () => void;
  resume?: () => void;
  start?: () => void;
  stop?: () => void;
  destroy?: () => void;
}

interface ActiveAgentsRegistry {
  ott: Map<string, AgentController>;
  webrtc: Map<string, AgentController>;
}

interface SDKContextState {
  mode: SDKMode;
}

type SDKContextAction = {
  type: 'SET_MODE';
  mode: SDKMode;
};

interface SDKContextValue extends SDKContextState {
  setMode: (mode: SDKMode) => void;
  toggleMode: () => void;
  activeAgents: MutableRefObject<ActiveAgentsRegistry>;
  registerAgent: (agent: AgentController) => void;
  unregisterAgent: (kind: SDKMode, id: string) => void;
}

const initialState: SDKContextState = {
  mode: SDKMode.OTT,
};

const SDKContext = createContext<SDKContextValue | null>(null);

function reducer(state: SDKContextState, action: SDKContextAction): SDKContextState {
  switch (action.type) {
    case 'SET_MODE':
      return { ...state, mode: action.mode };
    default:
      return state;
  }
}

export function SDKProvider({ children }: PropsWithChildren): JSX.Element {
  const [state, dispatch] = useReducer(reducer, initialState);
  const previousModeRef = useRef<SDKMode>(initialState.mode);
  const activeAgents = useRef<ActiveAgentsRegistry>({
    ott: new Map<string, AgentController>(),
    webrtc: new Map<string, AgentController>(),
  });

  const registerAgent = useCallback((agent: AgentController) => {
    const registry =
      agent.kind === SDKMode.WEBRTC ? activeAgents.current.webrtc : activeAgents.current.ott;
    registry.set(agent.id, agent);
  }, []);

  const unregisterAgent = useCallback((kind: SDKMode, id: string) => {
    const registry = kind === SDKMode.WEBRTC ? activeAgents.current.webrtc : activeAgents.current.ott;
    registry.delete(id);
  }, []);

  const setMode = useCallback((mode: SDKMode) => {
    dispatch({ type: 'SET_MODE', mode });
  }, []);

  const toggleMode = useCallback(() => {
    dispatch({
      type: 'SET_MODE',
      mode: state.mode === SDKMode.OTT ? SDKMode.WEBRTC : SDKMode.OTT,
    });
  }, [state.mode]);

  useEffect(() => {
    const previousMode = previousModeRef.current;
    if (previousMode === state.mode) {
      return;
    }

    if (state.mode === SDKMode.WEBRTC) {
      activeAgents.current.ott.forEach((agent) => {
        agent.pause?.();
      });

      activeAgents.current.webrtc.forEach((agent) => {
        agent.start?.();
      });
    } else {
      activeAgents.current.webrtc.forEach((agent) => {
        if (agent.destroy) {
          agent.destroy();
          return;
        }

        agent.stop?.();
      });

      activeAgents.current.ott.forEach((agent) => {
        agent.resume?.();
      });
    }

    previousModeRef.current = state.mode;
  }, [state.mode]);

  const value = useMemo<SDKContextValue>(
    () => ({
      mode: state.mode,
      setMode,
      toggleMode,
      activeAgents,
      registerAgent,
      unregisterAgent,
    }),
    [registerAgent, setMode, state.mode, toggleMode, unregisterAgent]
  );

  return <SDKContext.Provider value={value}>{children}</SDKContext.Provider>;
}

export function useSDKContext(): SDKContextValue {
  const context = useContext(SDKContext);
  if (!context) {
    throw new Error('useSDKContext must be used within SDKProvider.');
  }

  return context;
}

export function useSDKMode(): Pick<SDKContextValue, 'mode' | 'setMode' | 'toggleMode'> {
  const { mode, setMode, toggleMode } = useSDKContext();
  return { mode, setMode, toggleMode };
}

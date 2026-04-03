import { createContext, useContext } from 'react';

/** Context for resume session functions provided by the WebSocket hook */
export interface ResumeContextValue {
  sendResume: (sessionId: string, message: string, fork?: boolean) => void;
  cancelResume: () => void;
}

export const ResumeContext = createContext<ResumeContextValue>({
  sendResume: () => {},
  cancelResume: () => {},
});

/** Hook to access resume session functions */
export function useResume(): ResumeContextValue {
  return useContext(ResumeContext);
}

import { createContext, useContext } from "react";

// Everything a workspace page needs to know about the signed-in user's company.
export const WorkspaceCtx = createContext(null);
export const useWorkspace = () => useContext(WorkspaceCtx);

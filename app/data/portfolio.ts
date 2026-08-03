export type ProjectStatus = "Concept" | "Prototype" | "Research" | "Completed";

export type PortfolioCategory =
  | "SolidWorks Parts and Assemblies"
  | "Mechanical Fabrication Drawings"
  | "Exploded Assembly Views"
  | "Edge-Device Models"
  | "Robotics Hardware"
  | "Civil Site Plans"
  | "Grading and Drainage Drawings"
  | "Utility Layouts"
  | "AutoCAD Cleanup Examples"
  | "Rendered 2D and 3D CAD Models";

export interface PortfolioProject {
  id: string;
  title: string;
  category: PortfolioCategory;
  description: string;
  /** e.g. ["SolidWorks", "AutoCAD"] */
  software: string[];
  /** Multiple preview images, lazy-loaded. Paths under /public. */
  images: string[];
  /** 2D drawing preview image, shown alongside the gallery. */
  drawingPreview?: string;
  /** Optional path to a glTF/GLB model for the interactive 3D viewer. */
  model3dUrl?: string;
  /** Optional PDF or drawing file for download. */
  downloadUrl?: string;
  status: ProjectStatus;
}

/**
 * Add new portfolio projects here as they become available.
 * Each entry automatically renders as a card in the Portfolio section
 * with lazy-loaded images and, if model3dUrl is set, an interactive 3D viewer.
 */
export const portfolioProjects: PortfolioProject[] = [];

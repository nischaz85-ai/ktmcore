export interface ServiceCardData {
  title: string;
  description: string;
}

export interface ServiceCategory {
  id: string;
  order: number;
  title: string;
  primary?: boolean;
  description: string;
  cards: ServiceCardData[];
  items: string[];
}

// Ordered: Mechanical CAD (primary) -> Edge Device & Robotics Hardware -> Civil CAD.
export const serviceCategories: ServiceCategory[] = [
  {
    id: "mechanical-cad",
    order: 1,
    title: "Mechanical CAD and Design",
    primary: true,
    description:
      "KTMcore's primary service: practical mechanical CAD, SolidWorks modeling, and product development support for parts and assemblies that need to work in the real world.",
    cards: [
      {
        title: "Mechanical CAD and Design",
        description:
          "SolidWorks part modeling and mechanical component design for parts that hold up through fabrication and assembly.",
      },
      {
        title: "SolidWorks Parts and Assemblies",
        description:
          "SolidWorks assemblies, fabrication drawings, exploded views, and bills of materials for manufacturing and fabrication teams.",
      },
      {
        title: "Product Development and Prototyping",
        description:
          "Prototype-ready models, design revisions, and reverse engineering to move ideas from concept through full product development.",
      },
    ],
    items: [
      "SolidWorks part modeling",
      "SolidWorks assemblies",
      "Mechanical component design",
      "Fabrication drawings",
      "Exploded views",
      "Bills of materials",
      "Product development",
      "Design revisions",
      "Reverse engineering",
      "Prototype-ready models",
    ],
  },
  {
    id: "edge-robotics-hardware",
    order: 2,
    title: "Edge Device and Robotics Hardware",
    description:
      "Mechanical packaging and hardware layouts for edge devices, sensors, cameras, and robotics systems.",
    cards: [
      {
        title: "Edge Device Design",
        description:
          "Edge-device enclosure design, sensor mounting systems, camera and electronics housings, and embedded-system hardware layouts.",
      },
      {
        title: "Robotics Hardware Integration",
        description:
          "Robotic component integration, mechanical-electrical packaging, prototype assembly design, and mounting brackets and equipment supports.",
      },
    ],
    items: [
      "Edge-device enclosure design",
      "Sensor mounting systems",
      "Camera and electronics housings",
      "Robotic component integration",
      "Mechanical-electrical packaging",
      "Embedded-system hardware layouts",
      "Prototype assembly design",
      "Mounting brackets and equipment supports",
    ],
  },
  {
    id: "civil-cad",
    order: 3,
    title: "Civil CAD Services",
    description:
      "Civil site layouts, grading and drainage plans, and AutoCAD drawing support for contractors and project teams.",
    cards: [
      {
        title: "Civil Site Layout",
        description:
          "Civil site layouts and contractor drawing support coordinated with real site constraints, access, and equipment placement.",
      },
      {
        title: "Grading and Drainage",
        description:
          "Grading plans and drainage layouts for site development and water management.",
      },
      {
        title: "Utility CAD Drawings",
        description:
          "Utility CAD drawings for site utilities, coordinated with civil layouts and contractor needs.",
      },
      {
        title: "AutoCAD Drawing Cleanup",
        description:
          "AutoCAD drawing cleanup, layer organization, linework correction, drawing conversion and formatting, and as-built drawing updates.",
      },
    ],
    items: [
      "Civil site layouts",
      "Grading plans",
      "Drainage layouts",
      "Utility CAD drawings",
      "AutoCAD drawing cleanup",
      "Layer organization",
      "Linework correction",
      "Drawing conversion and formatting",
      "As-built drawing updates",
      "Contractor drawing support",
    ],
  },
];

// Appears last in the service-card order, after Mechanical, Edge/Robotics, and Civil.
export const simulationServiceCard: ServiceCardData = {
  title: "Robotic Simulation",
  description:
    "Interactive robotic simulation, path planning, and autonomous navigation testing, already part of KTMcore and available below.",
};

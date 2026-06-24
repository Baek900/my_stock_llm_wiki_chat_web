# Design System: Cognitive Nexus
Asset Name: assets/923ac45ead9443d295f3296982900eed

## Brand & Style
The design system is engineered for an AI-powered Knowledge Graph Wiki, focusing on the intersection of deep technical research and fluid AI synthesis. The brand personality is **scholarly yet futuristic**, evoking the feeling of a digital "second brain" that organizes chaos into structured insight.

The visual style is a hybrid of **Modern Corporate** and **Glassmorphism**. It utilizes a "light mode" foundation to maintain the clarity of traditional technical documentation while employing translucent, layered elements for AI-driven interfaces. This creates a clear hierarchy between static "knowledge" (flat, structured) and dynamic "intelligence" (floating, blurred, motion-heavy). The emotional response should be one of precision, depth, and discovery.

## Layout & Spacing
The system utilizes a **dual-pane fixed grid** for its primary research interface. 

- **Left Pane (35%):** Reserved for "Sources," citations, and raw document viewing. This creates a factual foundation on the left.
- **Right Pane (65%):** The "AI Workbench" where synthesized content and graph visualizations live.
- **Global Sidebar:** A fixed 280px navigation rail for project and entity management.

The spacing rhythm follows an 8px base unit. Margins are kept wide (24px) to provide visual "breathing room" amidst complex data visualizations. For mobile, the layout reflows into a single-column stacked view, with the Knowledge Graph accessible via a floating action toggle.

## Elevation & Depth
This design system uses a combination of **tonal layering** and **glassmorphism** to communicate hierarchy:

1.  **Base Layer:** Solid white background for the primary workspace.
2.  **Container Layer:** Subtle grey surfaces (#F9FAFB) with 1px borders to define toolbars and sidebars.
3.  **Intelligence Layer (Floating):** Chat interfaces and hover-state node details use a frosted glass effect (Backdrop Blur: 12px, White Opacity: 70%). These elements use a soft, multi-layered "Ambient Shadow" (15% opacity, 20px blur) to appear as if hovering above the data.
4.  **Active Focus:** When a node is selected, all other elements desaturate slightly, and the selected node emits a soft glow in its primary color.

## Components

### Buttons & Inputs
- **Primary Action:** Solid Electric Blue with white text, 8px corner radius.
- **Ghost Action:** Deep Purple outline for secondary AI functions.
- **Search Bar:** Large, centered input with a subtle inner shadow and a glassmorphic background when floating over the graph.

### Source Highlights (Citations)
- **Source Chips:** Vibrant Orange backgrounds with Monospace text. 
- **Citations:** Inline numeric tags `[1]` in Orange, which reveal a glassmorphic source preview on hover.

### The Knowledge Graph
- **Nodes:** Circles color-coded by type (Blue for Entities, Purple for Concepts).
- **Edges:** Thin, light-grey lines (#E5E7EB) that animate "pulses" of light when data is being fetched or synchronized.

### Chat Interface
- **Floating Panel:** Positioned in the bottom-right. Uses a high-blur backdrop and a 16px radius. Messages from the AI are styled with a subtle purple-to-blue gradient border.

### Notebook Panes
- **Divider:** A draggable vertical handle that allows users to adjust the ratio between "Source" and "AI Content." On hover, the divider glows in the Accent Orange.
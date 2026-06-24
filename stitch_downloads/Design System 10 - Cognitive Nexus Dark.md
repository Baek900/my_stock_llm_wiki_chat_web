# Design System: Cognitive Nexus Dark
Asset Name: assets/f56e77f6a7f44e2b8067618220b1c97c

## Brand & Style
The brand personality is analytical, sophisticated, and high-performance. It targets data scientists, developers, and technical architects who require a focused environment for complex cognitive tasks. 

The design style is **Corporate Modern** with a **Glassmorphic** twist. It utilizes deep, layered surfaces to create a sense of infinite digital space, reducing eye strain during prolonged sessions. The aesthetic is "Technical Premium"—it feels like a high-end command center where information is prioritized through subtle depth and precise typography.

## Layout & Spacing
The system employs a **Fluid Grid** model based on a 4px baseline.
- **Desktop:** 12-column grid with 24px gutters. Margins are generous (48px) to frame the content.
- **Tablet:** 8-column grid with 16px gutters.
- **Mobile:** 4-column grid with 16px gutters and 16px side margins.
Spacing is used mathematically to group related cognitive units, with larger gaps (`xl`) used to separate distinct functional modules.

## Elevation & Depth
In this dark mode environment, depth is achieved through **Tonal Layering** and **Glassmorphism**:
- **Z-0 (Background):** Pure `#0B0B0C`.
- **Z-1 (Cards/Containers):** `#121214` with a subtle 1px inner border (outline-variant) to define edges.
- **Z-2 (Overlays/Modals):** Glassmorphic surfaces with a 20px backdrop blur and 60% opacity fill of the surface color.
- **Shadows:** Avoid heavy black shadows. Use soft, semi-transparent indigo-tinted shadows to create a "lift" effect without muddying the dark background.

## Components
- **Buttons:** Primary buttons use the optimized blue (`#4D7CFF`) with white text. Ghost buttons use the `outline` token with a subtle hover state that fills with a 10% primary tint.
- **Chips:** Highly subtle, using `surface-container-high` backgrounds and `on-surface-variant` text to avoid visual clutter in data-heavy views.
- **Input Fields:** Darker than the surface (`#0B0B0C`) to create a "well" effect, with a 1px border that glows slightly (2px blur) when focused.
- **Cards:** No external shadows on standard cards; use the `surface-container` background and a refined 1px border.
- **Lists:** Separated by thin `outline` dividers. Hover states use a subtle horizontal gradient from `primary` at 5% opacity to transparent.
- **Data Visuals:** Use the secondary and tertiary palette. Ensure lines are 2px thick to maintain visibility against the dark backdrop.
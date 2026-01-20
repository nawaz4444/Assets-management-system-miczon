import { createTheme } from '@mui/material/styles';

// MD3 Standard Tonal Palette
const palette = {
  primary: {
    main: '#00639B', // Google Blue
    light: '#D1E4F6', // Primary Container (Backgrounds)
    dark: '#004A6F',
    contrastText: '#FFFFFF',
  },
  secondary: {
    main: '#535F70', // Slate
    light: '#D7E3F7', // Secondary Container
    dark: '#2E3A4A',
    contrastText: '#FFFFFF',
  },
  error: {
    main: '#BA1A1A',
    light: '#FFDAD6',
    dark: '#93000A',
  },
  success: {
    main: '#146C2E',
    light: '#C4EED0',
    dark: '#0D4A1F',
  },
  background: {
    default: '#F8FDFF', // Alice Blue Tint
    paper: '#FFFFFF',   // Pure White Surface
  },
  text: {
    primary: '#1D1B20', // MD3 "On Surface" (Softer than #000)
    secondary: '#444746', // MD3 "On Surface Variant"
    disabled: '#1D1B201F', // Opacity based
  },
  divider: '#E0E3E7',
};

const theme = createTheme({
  palette: palette,
  shape: {
    borderRadius: 12, // Standardizing corners to 12px (Modern standard)
  },
  typography: {
    fontFamily: '"Roboto", "Google Sans", "Arial", sans-serif',
    // Headings: Dark, readable, tight spacing
    h1: { fontSize: '2.25rem', fontWeight: 600, color: '#1D1B20', letterSpacing: '-0.02em' },
    h2: { fontSize: '1.75rem', fontWeight: 600, color: '#1D1B20', letterSpacing: '-0.01em' },
    h3: { fontSize: '1.5rem', fontWeight: 600, color: '#1D1B20' },
    h4: { fontSize: '1.25rem', fontWeight: 600, color: '#1D1B20' },
    h5: { fontSize: '1.125rem', fontWeight: 600, color: '#1D1B20' },
    h6: { fontSize: '1rem', fontWeight: 600, color: '#1D1B20' },
    // Body: High readability
    body1: { fontSize: '1rem', lineHeight: 1.5, color: '#1D1B20' },
    body2: { fontSize: '0.875rem', lineHeight: 1.43, color: '#444746' },
    // Button text
    button: { textTransform: 'none', fontWeight: 500, letterSpacing: '0.01em' },
  },
  components: {
    // 1. BUTTONS (Pill Shape & Hover States)
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 20, // Full Pill
          textTransform: 'none',
          fontWeight: 500,
          boxShadow: 'none',
          padding: '8px 20px',
          transition: 'all 0.2s ease-in-out',
          '&:hover': { boxShadow: 'none' }, // Flat design
        },
        contained: {
          backgroundColor: '#00639B',
          '&:hover': {
            backgroundColor: '#004A6F', // Slightly darker
            boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.3)', // Subtle lift
          },
        },
        outlined: {
          borderWidth: '1px',
          borderColor: '#747775', // Standard Outline Color
          color: '#00639B',
          '&:hover': {
            backgroundColor: 'rgba(0, 99, 155, 0.08)',
            borderWidth: '1px', // Keep border thin
            borderColor: '#00639B',
          },
        },
        text: {
          color: '#00639B',
          '&:hover': { backgroundColor: 'rgba(0, 99, 155, 0.08)' },
        },
      },
    },

    // 2. CARDS (Outlined & Floating)
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16, // Modern rounded corners
          border: '1px solid #E0E3E7', // Subtle outline
          boxShadow: 'none', // Flat by default
          backgroundColor: '#FFFFFF',
          transition: 'transform 0.2s, box-shadow 0.2s',
          '&:hover': {
            // Optional: micro-interaction on hover
            borderColor: '#C2C7CF',
          },
        },
      },
    },

    // 3. TEXT FIELDS (Clean & Accessible)
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
        size: 'small', // Compact by default
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 8, // Slightly rounded inputs
          backgroundColor: '#FFFFFF',
          '& fieldset': { borderColor: '#747775' }, // Default border
          '&:hover fieldset': { borderColor: '#1D1B20' }, // Darker on hover
          '&.Mui-focused fieldset': {
            borderColor: '#00639B', // Primary on focus
            borderWidth: '2px',
          },
        },
      },
    },

    // 4. TABLES (Data Dense & Readable)
    MuiTableHead: {
      styleOverrides: {
        root: {
          backgroundColor: '#F8FDFF', // Match background
          '& .MuiTableCell-head': {
            color: '#444746',
            fontWeight: 600,
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            borderBottom: '1px solid #C2C7CF',
          },
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:last-child td, &:last-child th': { border: 0 },
          '&:hover': { backgroundColor: '#F0F7FF !important' }, // Subtle blue hover
        },
      },
    },

    // 5. CHIPS (Status Indicators)
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8, // Rounded square (Assist Chip)
          fontWeight: 500,
          fontSize: '0.8125rem',
        },
        // We can create custom variants for status colors in the component usage
        // e.g., <Chip sx={{ bgcolor: 'success.light', color: 'success.dark' }} />
      },
    },

    // 6. ICONS (Consistent Sizing)
    MuiSvgIcon: {
      styleOverrides: {
        root: {
          fontSize: '1.25rem', // 20px default (Small & Elegant)
        },
        fontSizeSmall: {
          fontSize: '1rem', // 16px
        },
        fontSizeLarge: {
          fontSize: '1.75rem', // 28px
        },
      },
    },

    // 7. APP BAR (Clean White Header)
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#FFFFFF',
          color: '#1D1B20',
          boxShadow: 'none',
          borderBottom: '1px solid #E0E3E7',
        },
      },
    },
  },
});

export default theme;
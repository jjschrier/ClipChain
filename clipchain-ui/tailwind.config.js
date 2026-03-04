/** @type {import('tailwindcss').Config} */
export default {
    content: [
        './index.html',
        './src/**/*.{js,ts,jsx,tsx}'
    ],
    theme: {
        extend: {
            colors: {
                primary: {
                    DEFAULT: '#7c3aed', // Purple tone
                    light: '#a78bfa',
                    dark: '#5b21b6'
                },
                secondary: {
                    DEFAULT: '#1e293b', // Slate background
                    light: '#334155',
                    dark: '#0f172a'
                },
                accent: {
                    DEFAULT: '#14b8a6', // Teal for buttons
                    hover: '#0d9488'
                }
            },
            fontFamily: {
                sans: ['Inter', 'ui-sans-serif', 'system-ui'],
                heading: ['Poppins', 'sans-serif']
            },
            boxShadow: {
                glow: '0 0 20px rgba(124, 58, 237, 0.6)', // Purple glow for cards
            },
            screens: {
                xs: '480px', // Extra small screens
            },
            animation: {
                fade: 'fadeIn 0.5s ease-in-out',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: 0 },
                    '100%': { opacity: 1 }
                }
            }
        }
    },
    plugins: [
        require('@tailwindcss/forms'), // Better form UI
        require('@tailwindcss/typography'), // For text content
        require('@tailwindcss/aspect-ratio') // Perfect for video thumbnails
    ]
};

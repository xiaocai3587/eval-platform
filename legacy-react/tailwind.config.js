import colors from 'tailwindcss/colors'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // 宽屏断点：3xl ≥ 1920px（1080P 全屏）、4xl ≥ 2560px（2K / 4K）
      screens: {
        '3xl': '1920px',
        '4xl': '2560px',
      },
      // 主色调：蓝色系（页面统一使用 primary-* 语义别名）
      colors: {
        primary: colors.blue,
      },
      boxShadow: {
        card: '0 1px 2px rgb(15 23 42 / 0.06)',
      },
    },
  },
  plugins: [],
}

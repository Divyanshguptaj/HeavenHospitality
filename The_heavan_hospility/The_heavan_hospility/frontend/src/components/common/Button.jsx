function Button({ children, variant = 'primary', className = '', ...props }) {
  const base =
    'inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-medium transition duration-200'

  const variants = {
    primary: 'bg-[#c98a4b] text-white shadow-sm hover:bg-[#b77c3f]',
    secondary: 'border border-slate-300 bg-white text-slate-800 hover:border-[#c98a4b] hover:text-[#8d5c2c]',
    dark: 'bg-slate-900 text-white hover:bg-slate-800',
  }

  return (
    <button type="button" className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  )
}

export default Button

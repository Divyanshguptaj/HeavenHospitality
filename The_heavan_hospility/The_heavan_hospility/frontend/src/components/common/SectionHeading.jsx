function SectionHeading({ eyebrow, title, description, align = 'left' }) {
  const alignClasses = {
    left: 'text-left',
    center: 'mx-auto max-w-2xl text-center',
  }

  return (
    <div className={alignClasses[align]}>
      {eyebrow && (
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-[#8d5c2c]">
          {eyebrow}
        </p>
      )}
      <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
        {title}
      </h2>
      {description && <p className="mt-4 text-base text-slate-600">{description}</p>}
    </div>
  )
}

export default SectionHeading

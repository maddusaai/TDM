import { motion } from 'framer-motion';

export function PageHeader({ title, description, icon: Icon }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="rounded-2xl bg-white px-5 py-4 shadow-sm md:px-6 md:py-5"
    >
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-slate-900 p-3 text-white">
          <Icon className="h-6 w-6" />
        </div>

        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            TDM Modernization MVP
          </p>
          <h1 className="mt-0.5 text-lg font-semibold tracking-tight text-slate-950 md:text-xl">
            {title}
          </h1>
          <p className="mt-1 max-w-3xl text-[12px] leading-5 text-slate-500 md:text-[13px]">
            {description}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

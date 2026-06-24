import { motion } from 'framer-motion';
import { Card, CardContent } from './Card';

function PageHeader({ title, description, icon: Icon }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="rounded-2xl bg-white px-5 py-4 shadow-sm md:px-6 md:py-5"
    >
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="rounded-2xl bg-slate-900 p-3 text-white">
            <Icon className="h-6 w-6" />
          </div>
        )}
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            TDM Modernization MVP
          </p>
          <h1 className="mt-0.5 text-lg font-semibold tracking-tight text-slate-950 md:text-xl">
            {title}
          </h1>
          {description && (
            <p className="mt-1 max-w-3xl text-[12px] leading-5 text-slate-500 md:text-[13px]">
              {description}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function PlaceholderPage({ title, description, icon, items = [] }) {
  return (
    <div className="space-y-6">
      {icon ? (
        <PageHeader title={title} description={description} icon={icon} />
      ) : (
        <div className="rounded-2xl bg-white px-5 py-4 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        </div>
      )}

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-6">
          <h2 className="text-base font-semibold text-slate-900">Blueprint Page</h2>
          <p className="mt-2 text-[13px] text-slate-500">
            This page is part of the realistic enterprise blueprint. The UI shell is ready;
            detailed backend logic can be connected next.
          </p>

          {items.length > 0 && (
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {items.map((item) => (
                <div key={item} className="rounded-2xl bg-slate-50 p-4 text-[13px] text-slate-700">
                  {item}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

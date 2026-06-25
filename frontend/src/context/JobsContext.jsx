import { createContext, useContext, useState, useEffect } from 'react';

const JobsContext = createContext(null);

const SESSION_KEY = 'tdm_jobs';

function loadFromSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function JobsProvider({ children }) {
  const [jobs, setJobs] = useState(loadFromSession);

  useEffect(() => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(jobs));
  }, [jobs]);

  const addJob = (job) => {
    setJobs((prev) => {
      if (prev.some((j) => j.job_id === job.job_id)) return prev;
      return [job, ...prev];
    });
  };

  const clearJobs = () => {
    setJobs([]);
    sessionStorage.removeItem(SESSION_KEY);
  };

  // Filter jobs for a specific pipeline
  const getJobsForPipeline = (pipelineIdOrName) =>
    jobs.filter(
      (j) => j.pipeline_id === pipelineIdOrName || j.pipeline_name === pipelineIdOrName
    );

  // Filter jobs triggered by a specific user
  const getJobsForUser = (userIdOrEmail) =>
    jobs.filter(
      (j) => j.triggered_by === userIdOrEmail || j.triggered_by_email === userIdOrEmail
    );

  return (
    <JobsContext.Provider value={{ jobs, addJob, clearJobs, getJobsForPipeline, getJobsForUser }}>
      {children}
    </JobsContext.Provider>
  );
}

export function useJobs() {
  const ctx = useContext(JobsContext);
  if (!ctx) throw new Error('useJobs must be used inside JobsProvider');
  return ctx;
}

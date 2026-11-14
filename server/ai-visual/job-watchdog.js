// Native inference cannot be safely cancelled with Promise.race: the old call
// would still consume CPU while another job starts. Terminate this dedicated
// worker instead; MySQL recovers its lease with the normal attempt limit.
export function createJobWatchdog(timeoutMs, onTimeout) {
  let timer;
  return {
    observe(event) {
      if (event.event === 'job_started') {
        clearTimeout(timer);
        timer = setTimeout(() => onTimeout(event.jobId), timeoutMs);
        timer.unref();
      } else if (event.event === 'job_settled') clearTimeout(timer);
    },
    stop() { clearTimeout(timer); }
  };
}

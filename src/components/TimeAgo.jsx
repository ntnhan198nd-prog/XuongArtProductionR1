import { useState, useEffect } from 'react';

function calculateTimeAgo(completionDate) {
  if (!completionDate) return '';
  const completion = new Date(completionDate);
  const diffInMs = Date.now() - completion.getTime();
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
  const diffInMonths = Math.floor(diffInDays / 30);
  const diffInYears = Math.floor(diffInDays / 365);

  if (diffInYears > 0) {
    return `${diffInYears} ${diffInYears === 1 ? 'year' : 'years'} ago`;
  }
  if (diffInMonths > 0) {
    return `${diffInMonths} ${diffInMonths === 1 ? 'month' : 'months'} ago`;
  }
  if (diffInDays > 0) {
    return `${diffInDays} ${diffInDays === 1 ? 'day' : 'days'} ago`;
  }
  return 'Today';
}

const TimeAgo = ({ completionDate, className = "" }) => {
  // Initialize with the computed value so SSR and the first client render
  // both produce the final string — no empty-then-filled flicker. Server
  // and client agree because Date.now() is evaluated during render in
  // both environments and the result is text, not a DOM attribute that
  // depends on time-of-render precision.
  const [timeAgo, setTimeAgo] = useState(() => calculateTimeAgo(completionDate));

  useEffect(() => {
    if (!completionDate) return undefined;
    setTimeAgo(calculateTimeAgo(completionDate));
    const interval = setInterval(() => {
      setTimeAgo(calculateTimeAgo(completionDate));
    }, 24 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [completionDate]);

  if (!completionDate) return null;

  return (
    <div className={`text-sm text-gray-500 ${className}`}>
      <span className="inline-flex items-center gap-1">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {timeAgo}
      </span>
    </div>
  );
};

export default TimeAgo;

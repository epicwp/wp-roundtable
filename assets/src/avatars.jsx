/** @jsx h */
import { h } from 'preact';

function RobotIcon() {
  return (
    <svg class="rt-robot-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 3a2.2 2.2 0 0 1 2.15 1.75h2.9A2.95 2.95 0 0 1 20 7.7v2.55a4.8 4.8 0 0 1 2 3.75V19a1 1 0 0 1-1 1h-1v1.5a1.5 1.5 0 0 1-3 0V20H7v1.5a1.5 1.5 0 0 1-3 0V20H3a1 1 0 0 1-1-1v-5a4.8 4.8 0 0 1 2-3.75V7.7a2.95 2.95 0 0 1 2.95-2.95h2.9A2.2 2.2 0 0 1 12 3zm-4.6 9.1a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8zm9.2 0a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8zM8.5 18.5h7V21h-7v-2.5z"
      />
    </svg>
  );
}

/**
 * Avatar for the AI assistant (Sage).
 * @param {{class?:string, size?:'sm'|'md'|'lg'}} props
 */
export function AgentAvatar({ class: className = '', size = 'md' }) {
  return (
    <div class={'rt-ava rt-ava-agent rt-ava-' + size + (className ? ' ' + className : '')} aria-hidden="true">
      <RobotIcon />
    </div>
  );
}

/**
 * Avatar for a community member (initials).
 * @param {{initials:string, class?:string, size?:'sm'|'md'|'lg'}} props
 */
export function PersonAvatar({ initials, class: className = '', size = 'md' }) {
  return (
    <div class={'rt-ava rt-ava-person rt-ava-' + size + (className ? ' ' + className : '')} aria-hidden="true">
      {initials}
    </div>
  );
}

/** @returns {string} */
export function agentDisplayName() {
  return (typeof window !== 'undefined' && window.RoundtableConfig?.agentName) || 'Sage';
}
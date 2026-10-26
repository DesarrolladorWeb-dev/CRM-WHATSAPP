import React from 'react';

type IconProps = React.SVGProps<SVGSVGElement>;

export const WhatsAppIcon: React.FC<IconProps> = ({
  className,
  ...props
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path d="M12.04 2C6.52 2 2.03 6.48 2.03 12c0 1.76.46 3.48 1.34 5L2 22l5.12-1.34A9.94 9.94 0 0 0 12.04 22C17.56 22 22 17.52 22 12S17.56 2 12.04 2Zm0 18.18c-1.55 0-3.06-.42-4.38-1.21l-.31-.18-3.04.8.81-2.96-.2-.31A8.12 8.12 0 0 1 3.68 12c0-4.61 3.75-8.35 8.36-8.35 4.6 0 8.32 3.74 8.32 8.35s-3.72 8.18-8.32 8.18Zm4.58-6.16c-.25-.13-1.48-.73-1.71-.81-.23-.08-.4-.13-.57.13-.17.25-.65.81-.79.98-.15.17-.29.19-.54.06-.25-.13-1.06-.39-2.02-1.25-.75-.67-1.25-1.49-1.4-1.74-.14-.25-.02-.39.11-.52.11-.11.25-.29.37-.44.13-.14.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.57-1.37-.78-1.87-.2-.49-.41-.42-.57-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.23.9 2.43 1.03 2.6.12.17 1.77 2.7 4.29 3.79.6.26 1.07.41 1.43.53.6.19 1.15.16 1.58.1.48-.07 1.48-.61 1.69-1.19.21-.59.21-1.09.15-1.19-.07-.1-.23-.16-.48-.29Z" />
  </svg>
);

export const XBrandIcon: React.FC<IconProps> = ({
  className,
  ...props
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
  </svg>
);

export const MessengerIcon: React.FC<IconProps> = ({
  className,
  ...props
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M21 11.5C21 16.2 16.97 20 12 20c-.87 0-1.7-.12-2.48-.34L5 22v-4.08C3.15 16.3 2 14.02 2 11.5 2 6.8 6.03 3 11 3h2c4.97 0 8 3.8 8 8.5Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M7.5 14 10.5 10.5 13 12.5 16.5 9"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
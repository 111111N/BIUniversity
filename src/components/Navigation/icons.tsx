import React from "react";


export const LogoIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...props}
    viewBox="0 0 48 48"
    xmlns="http://www.w3.org/2000/svg"
    width="48"
    height="48"
  >
    <defs>
      <linearGradient id="logoGradient" x1="0.612" y1="154.199" x2="202.077" y2="154.199" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="var(--accent-secondary)" />
        <stop offset="1" stopColor="var(--accent-primary)" />
      </linearGradient>
    </defs>

    <g transform="matrix(0.21839202,0,0,0.18977937,1.8663456,-4.5684394)" fill="url(#logoGradient)" stroke="#000">
      <path
        d="M28.5539 135.08L2.74191 154.688c-1.04518.669-.63066 1.286.03153 1.894l62.22776 40.986c3.2395.495 5.3256-.558 8.1078-2.591l92.548-72.627c1.753-1.212 2.84-1.093 3.998-1.116l15.215 9.907c2.102 1.21 2.388 1.01 3.379-.02l3.873-3.726c.169-.629.672-1.174-1.048-2.274L143.925 93.8557c-3.485-2.1773-5.967-1.466-8.419-.4573L38.9902 170.009c-1.3065.706-1.7133-.027-2.4647-.21L24.4877 161.23c-.5223-.686-.5104-1.373.6896-2.059l12.4224-10.312c1.1906-.435 1.4697-.111 1.9641.034l8.3932 5.069c.5386.217.9764.132 1.3928-.018l5.2591-4.187c.3396-.465.356-.93-.3947-1.394L32.0781 135.016c-1.3992-.409-2.1708-.315-3.5242.064z"
        strokeWidth="2"
        
      />
      <path
        d="m94.531 184.61 6.808-5.237 12.046 7.856c1.787.875 2.227.156 3.142 0l44.516-35.744c.843-.496 1.708-.961 3.404-.262l35.713 23.848c.556.648.556 1.296 0 1.944l-48.327 37.773c-3.636 1.384-7.413 1.423-11.295.463z"
        strokeWidth="2"
      />
    </g>
  </svg>
);


export const CabinetIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...props}
    viewBox="0 0 48 48"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="bevel"
      strokeMiterlimit="40"
      cx="24"
      cy="14"
      r="8.37"
    />
    <path
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="bevel"
      strokeMiterlimit="40"
      d="M6.5 43C19.77 20.01 24.62 16.65 35.63 33.36c1.78 2.69 3.71 5.9 5.87 9.64"
    />
  </svg>
);

export const HomeIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...props}
    viewBox="0 0 48 48"
    xmlns="http://www.w3.org/2000/svg"
    width="48"
    height="48"
    fill="none"
  >
    <path
      d="M39 43V23h2.5L24 5.5 6.5 23H9v20"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </svg>
);

export const PlannerIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...props}
    viewBox="0 0 48 48"
    xmlns="http://www.w3.org/2000/svg"
    width="48"
    height="48"
    fill="none"
  >
    <path
      d="M6.5 43V5.5h29l6 7.5v30z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path
      d="M12 21.5h24.29M12 28.5h24.29M12 35.5h24.29"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="bevel"
    />
    <rect
      x="6.46"
      y="5.46"
      width="8.07"
      height="8.07"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="bevel"
    />
  </svg>
);

export const ScheduleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" fill="none">
    <path
      d="M41.5 13.17H6.5V36.5c0 3.97 1.99 6.5 6 6.5h23c4.06 0 6-2.54 6-6.5z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path
      d="M6.51 12.74c0-5.9 0-7.14 5.93-7.14h23.56c5.96 0 5.93 1.12 5.93 7.14z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    {/* Ячейки календаря */}
    {[0, 7, 14].map((dy) =>
      [9.5, 17.5, 25.5, 33.5].map((dx, i) => (
        <rect
          key={`${dx}-${dy}-${i}`}
          x={dx}
          y={17.5 + dy}
          width="5"
          height="5"
          stroke="currentColor"
          strokeWidth="1.1"
          fill="none"
        />
      ))
    )}
    {/* Верхние отметки */}
    {[13, 23, 33].map((x, i) => (
      <rect
        key={i}
        x={x}
        y={3}
        width="2"
        height="5.5"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1"
      />
    ))}
  </svg>
);
export const StatsIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...props} // теперь color и другие props передаются
    viewBox="0 0 48 48"
    xmlns="http://www.w3.org/2000/svg"
    width="48"
    height="48"
    fill="none"
  >
    <g>
      <path
        d="M 40.265625,16.318359 C 37.185661,18.008672 24.125,24.5625 24.125,24.5625 L 14.029297,9.0527344 A 17.98851,17.988512 0 0 0 6.0117187,24 17.98851,17.988512 0 0 0 24,41.988281 17.98851,17.988512 0 0 0 41.988281,24 17.98851,17.988512 0 0 0 40.265625,16.318359 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M 24,6.0117187 A 17.98851,17.988512 0 0 0 14.029297,9.0527344 L 24.125,24.5625 c 0,0 13.060661,-6.553828 16.140625,-8.244141 A 17.98851,17.988512 0 0 0 24,6.0117187 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </g>
  </svg>
)
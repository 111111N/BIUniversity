import * as React from "react";

// --- Общий интерфейс для всех иконок ---
interface IconProps {
  size?: number;
  color?: string;
  color2?: string;
  fill?: string;   
  textColor?: string;  
  text?: string;       
  className?: string;

}

// ---------------- ArrowIcon ----------------
export const ArrowIcon: React.FC<IconProps & { direction?: "up" | "down" | "left" | "right" }> = ({
  direction = "down",
  size = 20,
  color = "currentColor",
  className,
}) => {
  const rotation = {
    up: "180deg",
    down: "0deg",
    left: "90deg",
    right: "-90deg",
  }[direction];

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill={color}
      className={className}
      style={{ transform: `rotate(${rotation})` }}
    >
      <path d="M4.516 7.548c0.436-0.446 1.043-0.481 1.576 0l3.908 3.747 3.908-3.747c0.533-0.481 1.141-0.446 1.574 0 0.436 0.445 0.408 1.197 0 1.615-0.406 0.418-4.695 4.502-4.695 4.502-0.217 0.223-0.502 0.335-0.787 0.335s-0.57-0.112-0.789-0.335c0 0-4.287-4.084-4.695-4.502s-0.436-1.17 0-1.615z" />
    </svg>
  );
};

// ---------------- EditIcon ----------------
export const EditIcon: React.FC<IconProps> = ({ size = 48, color = "currentColor", className }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill={color}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="m34.961 5.766-5.223 5.149 8.763 8.566 5.23-5.158z"
        style={{ fill: color }}
      />
      <path
        d="M36.362 21.631 27.539 13.161 6.5 34.104 4.527 44H14z"
        style={{ fill: color }}
      />
    </svg>
  );
};

// ---------------- PdfIcon ----------------
export const PdfIcon: React.FC<IconProps> = ({
  size = 48,
  color = "currentColor",
  textColor = "#fff",
  text = "PDF",
  className
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M6.5 43V5.5h29l6 7.5-0.003 30z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <path
        d="M12 18.494H36.286M12 25.494H36.286M12.092 32.494H36.378"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="bevel"
      />
      <rect
        x={4.458}
        y={31.474}
        width={19.279}
        height={7.102}
        fill={color}
        stroke={color}
        strokeWidth={2.898}
        strokeLinejoin="bevel"
      />
      <text
        x={5.5}
        y={38}
        fill={textColor}   // цвет текста теперь можно передавать
        fontSize={8}
        fontFamily="Arial"
      >
        {text}       
      </text>
    </svg>
  );
};

// ---------------- MarkIcon ----------------
export const VisitMarkIcon: React.FC<IconProps> = ({
  size = 48,
  color = "currentColor",
  color2 = "currentColor",
  fill = "currentColor",
  className
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      stroke={color}
      className={className}
    >

      <circle
        cx="24"
        cy="24"
        r="19.374"
        stroke={color2}
        strokeWidth="4"
      />

      <circle
        cx="24"
        cy="24.06"
        r="12.11"
        fill={fill}
        stroke={color}
        strokeWidth="4"
      />
    </svg>
  );
};


// ---------------- RectIcon ----------------
export const MinusIcon: React.FC<IconProps> = ({
  size = 48,
  color = "currentColor",
  fill = "currentColor",
  className
}) => {

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill={color}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect
        x="8.5"
        y="22.5"
        width="30"
        height="5"
        fill={fill}
        stroke={color}
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
};

// ---------------- PlusIcon ----------------
export const PlusIcon: React.FC<IconProps> = ({
  size = 48,
  color = "currentColor",
  fill = "currentColor",
  className
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill={color}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M22.662 4.338V22.5H4.5v3h18.162V43.164h3.002V25.5h18.162v-3H25.664V4.338Z"
        fill={fill}
        stroke={color}
        strokeLinejoin="round"
      />
    </svg>
  );
};


export const CloseIcon: React.FC<IconProps> = ({
  size = 48,
  color = "currentColor",
  fill = "currentColor",
  className
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill={fill}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M5 7.695 21.305 24 5 40.305 7.693 43 24 26.693 40.305 43 43 40.305 26.693 24 43 7.693 40.305 5 24 21.305 7.695 5 Z"
        fill={fill}
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </svg>
  );
};

export const AcceptIcon: React.FC<IconProps> = ({
  size = 48,
  color = "currentColor",
  fill = "currentColor",
  className,
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M 41.642796,11.142454 20.414429,32.942163 8.0334897,21.517873 4.9991943,24.818787 20.911695,39.499069 21.268555,39.110381 45.000803,14.740255 Z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        fill={fill}
      />
    </svg>
  );
};
import React from 'react';

interface ComponentNameProps {
  data?: { name: string };
}

export const ComponentName: React.FC<ComponentNameProps> = ({ data }) => {
  return (
    <div>
      <h1>ComponentName</h1>
      <button>Click me</button>
      {data && <p>{data.name}</p>}
    </div>
  );
};

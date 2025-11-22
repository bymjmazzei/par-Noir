import React from 'react';
import { Plus, Edit2 } from 'lucide-react';

interface PermissionTileProps {
  title: string;
  hasData: boolean;
  onClick: () => void;
}

export const PermissionTile: React.FC<PermissionTileProps> = ({
  title,
  hasData,
  onClick
}) => {
  return (
    <div 
      className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-secondary/50 transition-colors cursor-pointer"
      onClick={onClick}
    >
      <div className="font-medium text-sm text-text-primary">
        {title}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className="flex items-center justify-center w-8 h-8 rounded-full border border-white bg-white hover:bg-gray-50 transition-colors"
        aria-label={hasData ? 'Edit' : 'Add'}
      >
        {hasData ? (
          <Edit2 className="w-4 h-4 text-text-primary" />
        ) : (
          <Plus className="w-4 h-4 text-text-primary" />
        )}
      </button>
    </div>
  );
};


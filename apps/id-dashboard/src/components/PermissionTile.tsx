import React from 'react';
import { Plus, Edit2, CheckCircle2 } from 'lucide-react';

interface PermissionTileProps {
  title: string;
  hasData: boolean;
  isVerified: boolean;
  isStatic?: boolean;
  onClick: () => void;
}

export const PermissionTile: React.FC<PermissionTileProps> = ({
  title,
  hasData,
  isVerified,
  isStatic = false,
  onClick
}) => {
  return (
    <div 
      className={`flex items-center justify-between p-4 border border-border rounded-lg transition-colors ${
        isStatic ? '' : 'hover:bg-secondary/50 cursor-pointer'
      }`}
      onClick={isStatic ? undefined : onClick}
    >
      <div className="flex items-center gap-2">
        {isVerified && (
          <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
        )}
        <div className="font-medium text-sm text-text-primary">
          {title}
        </div>
      </div>
      {!isStatic && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          className="flex items-center justify-center w-8 h-8 rounded-full transition-colors"
          aria-label={hasData ? 'Edit' : 'Add'}
        >
          {hasData ? (
            <Edit2 className="w-4 h-4 text-white" />
          ) : (
            <Plus className="w-4 h-4 text-white" />
          )}
        </button>
      )}
    </div>
  );
};


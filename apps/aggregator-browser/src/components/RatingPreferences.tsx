/**
 * Rating Preferences Component
 * Allows users to set their maximum acceptable content rating
 */

import React from 'react';
import { ContentRating } from '../types/aggregator';
import { CONTENT_RATINGS, RATING_ORDER } from '../constants/contentRatings';
import { useUserState } from '../contexts/UserStateContext';
import { Shield, Lock } from 'lucide-react';

export function RatingPreferences() {
  const { userState, updateMaxRating, setAgeVerified } = useUserState();
  const { maxRating, ageVerified, verifiedAge } = userState.preferences;

  const handleRatingChange = (rating: ContentRating) => {
    const ratingInfo = CONTENT_RATINGS[rating];
    
    // If rating requires verification and user hasn't verified, prompt
    if (ratingInfo.requiresVerification && !ageVerified) {
      const age = prompt(`This rating requires age verification. Please enter your age:`);
      if (age) {
        const ageNum = parseInt(age, 10);
        if (ageNum >= ratingInfo.ageRestriction) {
          setAgeVerified(ageNum);
          updateMaxRating(rating);
        } else {
          alert(`You must be at least ${ratingInfo.ageRestriction} to view ${rating} content.`);
        }
      }
    } else {
      updateMaxRating(rating);
    }
  };

  return (
    <div className="bg-neutral-900/60 border border-neutral-700 rounded-xl p-4">
      <div className="flex items-center space-x-2 mb-4">
        <Shield className="h-5 w-5 text-blue-400" />
        <h3 className="text-white font-medium">Content Rating Preferences</h3>
      </div>
      
      <div className="space-y-2">
        {RATING_ORDER.map((rating) => {
          const ratingInfo = CONTENT_RATINGS[rating];
          const isSelected = maxRating === rating;
          const isDisabled = ratingInfo.requiresVerification && !ageVerified;
          
          return (
            <label
              key={rating}
              className={`flex items-center space-x-3 p-3 rounded-lg cursor-pointer transition-colors ${
                isSelected
                  ? 'bg-blue-500/20 border-2 border-blue-500'
                  : 'bg-neutral-800/50 border-2 border-transparent hover:bg-neutral-800'
              } ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <input
                type="radio"
                name="maxRating"
                value={rating}
                checked={isSelected}
                onChange={() => handleRatingChange(rating)}
                disabled={isDisabled}
                className="w-4 h-4 text-blue-600 focus:ring-blue-500"
              />
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <span className="text-white font-medium">{rating}</span>
                  {ratingInfo.requiresVerification && (
                    <Lock className="h-3 w-3 text-yellow-400" />
                  )}
                  {isSelected && (
                    <span className="text-xs text-blue-400">(Current)</span>
                  )}
                </div>
                <p className="text-xs text-text-secondary mt-1">
                  {ratingInfo.description}
                </p>
                {ratingInfo.ageRestriction > 0 && (
                  <p className="text-xs text-yellow-400 mt-1">
                    Age {ratingInfo.ageRestriction}+
                    {!ageVerified && ratingInfo.requiresVerification && ' (Verification Required)'}
                    {ageVerified && verifiedAge && ` (Verified: ${verifiedAge})`}
                  </p>
                )}
              </div>
            </label>
          );
        })}
      </div>
      
      {!ageVerified && (
        <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
          <p className="text-xs text-yellow-400">
            Some ratings require age verification. You'll be prompted when selecting them.
          </p>
        </div>
      )}
    </div>
  );
}


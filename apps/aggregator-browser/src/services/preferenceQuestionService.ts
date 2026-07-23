/**
 * Preference Question Service
 * Generates preference questions based on feed content and user state
 */

import { IndexedFile } from '../types/aggregator';
import { PreferenceQuestion, PreferenceType } from '../components/PreferenceTile';
import { TagNormalizationService } from './tagNormalizationService';

export interface PreferenceState {
  askedQuestions: Set<string>; // Track which questions have been asked
  lastQuestionIndex: number; // Last index where a question was shown
}

export class PreferenceQuestionService {
  /**
   * Generate a preference question based on current feed content
   */
  static generateQuestion(
    files: IndexedFile[],
    currentIndex: number,
    userPreferences: {
      subscribedSubjects: string[];
      blockedSubjects: string[];
      subscribedCategories: string[];
      blockedCategories: string[];
    },
    askedQuestions: Set<string>
  ): PreferenceQuestion | null {
    // Show preference tile every 12 items (configurable)
    const QUESTION_INTERVAL = 12;
    const lastQuestionIndex = Math.floor((currentIndex - 1) / QUESTION_INTERVAL) * QUESTION_INTERVAL;
    
    // Only show if we've scrolled past the interval
    if (currentIndex <= lastQuestionIndex + QUESTION_INTERVAL) {
      return null;
    }

    // Look at recent content to generate relevant questions
    const recentFiles = files.slice(Math.max(0, currentIndex - 5), currentIndex);
    
    // Extract and normalize all tags from recent content
    const allTags = new Map<string, { count: number; tag: any; fileType?: string }>();
    
    recentFiles.forEach(file => {
      const unifiedTags = TagNormalizationService.getUnifiedTags(file, {
        fileId: file.metadata.fileId
      });
      
      unifiedTags.forEach(tag => {
        // Skip if user already has preference
        const isSubscribed = userPreferences.subscribedSubjects.includes(tag.id) ||
                           userPreferences.subscribedCategories.includes(tag.id);
        const isBlocked = userPreferences.blockedSubjects.includes(tag.id) ||
                         userPreferences.blockedCategories.includes(tag.id);
        
        if (isSubscribed || isBlocked) return;
        
        // Count occurrences
        const existing = allTags.get(tag.id);
        if (existing) {
          existing.count++;
        } else {
          allTags.set(tag.id, { 
            count: 1, 
            tag,
            fileType: file.metadata.fileType
          });
        }
      });
    });
    
    // Generate questions from normalized tags
    const candidates: PreferenceQuestion[] = [];
    
    allTags.forEach(({ count, tag, fileType }) => {
      if (count < 2) return; // Need at least 2 occurrences
      
      let questionId: string;
      let question: string;
      let value: string;
      
      switch (tag.type) {
        case 'category':
          questionId = `category-${tag.id}`;
          if (askedQuestions.has(questionId)) return;
          
          question = `Do you like ${tag.displayName} content?`;
          value = tag.id;
          candidates.push({
            id: questionId,
            type: 'category',
            question,
            value,
            metadata: { category: tag.id }
          });
          break;
          
        case 'subject':
          // Combine with fileType if available
          if (fileType) {
            const fileTypeLabel = fileType === 'video' ? 'videos' : 
                                 fileType === 'image' ? 'photos' : 
                                 fileType === 'text' ? 'posts' : 
                                 fileType === 'thought' ? 'thoughts' :
                                 `${fileType}s`;
            questionId = `contentType-${tag.id}-${fileType}`;
            if (askedQuestions.has(questionId)) return;
            
            question = `Do you like ${tag.displayName} ${fileTypeLabel}?`;
            value = `${tag.id} ${fileTypeLabel}`;
            candidates.push({
              id: questionId,
              type: 'contentType',
              question,
              value,
              metadata: { fileType, subject: tag.id }
            });
          } else {
            questionId = `subject-${tag.id}`;
            if (askedQuestions.has(questionId)) return;
            
            question = `Do you like ${tag.displayName} content?`;
            value = tag.id;
            candidates.push({
              id: questionId,
              type: 'subject',
              question,
              value,
              metadata: { subject: tag.id }
            });
          }
          break;
          
        case 'contentType':
          questionId = `contentType-${tag.id}`;
          if (askedQuestions.has(questionId)) return;
          
          question = `Do you like ${tag.displayName}?`;
          value = tag.id;
          candidates.push({
            id: questionId,
            type: 'contentType',
            question,
            value,
            metadata: { fileType: fileType }
          });
          break;
      }
    });
    
    // Also check for creator questions (if user has seen multiple posts from same creator)
    const creators = new Map<string, { count: number; name: string; id: string }>();
    recentFiles.forEach(file => {
      const creatorId = file.metadata.creator?.identifier?.value || 
                       file.metadata.author?.did ||
                       file.metadata.creator?.["@id"];
      const creatorName = file.metadata.creator?.name || 
                         file.metadata.author?.username ||
                         'this creator';
      
      if (creatorId) {
        const existing = creators.get(creatorId);
        creators.set(creatorId, {
          count: (existing?.count || 0) + 1,
          name: existing?.name || creatorName,
          id: creatorId
        });
      }
    });

    creators.forEach((info, creatorId) => {
      const questionId = `creator-${creatorId}`;
      if (!askedQuestions.has(questionId) && info.count >= 3) {
        candidates.push({
          id: questionId,
          type: 'creator',
          question: `Do you like content from ${info.name}?`,
          value: info.name,
          metadata: { creatorId, creatorName: info.name }
        });
      }
    });

    // Return a random candidate (or prioritize by frequency)
    if (candidates.length === 0) {
      return null;
    }

    // Prioritize: contentType > category > subject > creator
    candidates.sort((a, b) => {
      const priority: Record<PreferenceType, number> = {
        contentType: 4,
        category: 3,
        subject: 2,
        creator: 1
      };
      return priority[b.type] - priority[a.type];
    });

    return candidates[0];
  }

  /**
   * Check if we should show a preference question at this index
   */
  static shouldShowQuestion(
    currentIndex: number,
    lastQuestionIndex: number,
    interval: number = 12
  ): boolean {
    return currentIndex > 0 && 
           currentIndex % interval === 0 && 
           currentIndex > lastQuestionIndex;
  }
}


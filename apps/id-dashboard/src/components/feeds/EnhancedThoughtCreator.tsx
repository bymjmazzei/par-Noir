/**
 * Enhanced Thought Creator
 * Rich text editor with buttons, links, polls, forms, and multiple media support
 * Used for creating enhanced "top post" profiles and feed posts
 */

import React, { useState, useRef } from 'react';
import { X, Plus, Image, Video, Link, List, FileText, Trash2 } from 'lucide-react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

export interface EnhancedPostContent {
  text: string;
  media: Array<{
    id: string;
    type: 'image' | 'video';
    url: string;
    thumbnail?: string;
  }>;
  buttons: Array<{
    id: string;
    label: string;
    url: string;
    style: 'primary' | 'secondary' | 'link';
  }>;
  polls: Array<{
    id: string;
    question: string;
    options: string[];
  }>;
  forms: Array<{
    id: string;
    title: string;
    fields: Array<{
      id: string;
      name: string;
      type: 'text' | 'email' | 'textarea' | 'select';
      required: boolean;
      options?: string[];
    }>;
  }>;
}

interface EnhancedThoughtCreatorProps {
  initialContent?: Partial<EnhancedPostContent>;
  onSubmit: (content: EnhancedPostContent) => Promise<void>;
  onCancel?: () => void;
  isTopPost?: boolean;
}

export const EnhancedThoughtCreator: React.FC<EnhancedThoughtCreatorProps> = ({
  initialContent,
  onSubmit,
  onCancel,
  isTopPost = false
}) => {
  const [content, setContent] = useState<EnhancedPostContent>({
    text: initialContent?.text || '',
    media: initialContent?.media || [],
    buttons: initialContent?.buttons || [],
    polls: initialContent?.polls || [],
    forms: initialContent?.forms || []
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'text' | 'media' | 'buttons' | 'polls' | 'forms'>('text');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTextChange = (value: string) => {
    setContent(prev => ({ ...prev, text: value }));
  };

  const handleAddMedia = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const url = e.target?.result as string;
        const newMedia = {
          id: `media_${Date.now()}_${Math.random()}`,
          type: file.type.startsWith('image/') ? 'image' as const : 'video' as const,
          url,
          thumbnail: file.type.startsWith('image/') ? url : undefined
        };
        setContent(prev => ({
          ...prev,
          media: [...prev.media, newMedia]
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveMedia = (id: string) => {
    setContent(prev => ({
      ...prev,
      media: prev.media.filter(m => m.id !== id)
    }));
  };

  const handleAddButton = () => {
    const newButton = {
      id: `button_${Date.now()}`,
      label: 'Button',
      url: 'https://',
      style: 'primary' as const
    };
    setContent(prev => ({
      ...prev,
      buttons: [...prev.buttons, newButton]
    }));
  };

  const handleUpdateButton = (id: string, updates: Partial<EnhancedPostContent['buttons'][0]>) => {
    setContent(prev => ({
      ...prev,
      buttons: prev.buttons.map(b => b.id === id ? { ...b, ...updates } : b)
    }));
  };

  const handleRemoveButton = (id: string) => {
    setContent(prev => ({
      ...prev,
      buttons: prev.buttons.filter(b => b.id !== id)
    }));
  };

  const handleAddPoll = () => {
    const newPoll = {
      id: `poll_${Date.now()}`,
      question: '',
      options: ['Option 1', 'Option 2']
    };
    setContent(prev => ({
      ...prev,
      polls: [...prev.polls, newPoll]
    }));
  };

  const handleUpdatePoll = (id: string, updates: Partial<EnhancedPostContent['polls'][0]>) => {
    setContent(prev => ({
      ...prev,
      polls: prev.polls.map(p => p.id === id ? { ...p, ...updates } : p)
    }));
  };

  const handleAddPollOption = (pollId: string) => {
    setContent(prev => ({
      ...prev,
      polls: prev.polls.map(p => 
        p.id === pollId 
          ? { ...p, options: [...p.options, `Option ${p.options.length + 1}`] }
          : p
      )
    }));
  };

  const handleRemovePollOption = (pollId: string, optionIndex: number) => {
    setContent(prev => ({
      ...prev,
      polls: prev.polls.map(p => 
        p.id === pollId 
          ? { ...p, options: p.options.filter((_, i) => i !== optionIndex) }
          : p
      )
    }));
  };

  const handleRemovePoll = (id: string) => {
    setContent(prev => ({
      ...prev,
      polls: prev.polls.filter(p => p.id !== id)
    }));
  };

  const handleAddForm = () => {
    const newForm = {
      id: `form_${Date.now()}`,
      title: '',
      fields: [{
        id: `field_${Date.now()}`,
        name: 'field1',
        type: 'text' as const,
        required: false
      }]
    };
    setContent(prev => ({
      ...prev,
      forms: [...prev.forms, newForm]
    }));
  };

  const handleUpdateForm = (id: string, updates: Partial<EnhancedPostContent['forms'][0]>) => {
    setContent(prev => ({
      ...prev,
      forms: prev.forms.map(f => f.id === id ? { ...f, ...updates } : f)
    }));
  };

  const handleAddFormField = (formId: string) => {
    setContent(prev => ({
      ...prev,
      forms: prev.forms.map(f => 
        f.id === formId 
          ? { 
              ...f, 
              fields: [...f.fields, {
                id: `field_${Date.now()}`,
                name: `field${f.fields.length + 1}`,
                type: 'text' as const,
                required: false
              }]
            }
          : f
      )
    }));
  };

  const handleRemoveFormField = (formId: string, fieldId: string) => {
    setContent(prev => ({
      ...prev,
      forms: prev.forms.map(f => 
        f.id === formId 
          ? { ...f, fields: f.fields.filter(field => field.id !== fieldId) }
          : f
      )
    }));
  };

  const handleRemoveForm = (id: string) => {
    setContent(prev => ({
      ...prev,
      forms: prev.forms.filter(f => f.id !== id)
    }));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onSubmit(content);
    } catch (error) {
      console.error('Submit error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-white mb-2">
          {isTopPost ? 'Enhanced Profile Post' : 'Create Post'}
        </h3>
        <p className="text-sm text-neutral-400">
          Create rich, interactive content with text, media, buttons, polls, and forms
        </p>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 mb-4 border-b border-neutral-700">
        {(['text', 'media', 'buttons', 'polls', 'forms'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-neutral-400 hover:text-neutral-300'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Text Editor */}
      {activeTab === 'text' && (
        <div className="mb-4">
          <ReactQuill
            theme="snow"
            value={content.text}
            onChange={handleTextChange}
            className="bg-neutral-800 text-white"
            modules={{
              toolbar: [
                [{ 'header': [1, 2, 3, false] }],
                ['bold', 'italic', 'underline', 'strike'],
                [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                ['link'],
                ['clean']
              ]
            }}
          />
        </div>
      )}

      {/* Media */}
      {activeTab === 'media' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-neutral-400">Add images or videos</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
            >
              <Plus className="h-4 w-4" />
              <span>Add Media</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*"
              onChange={handleAddMedia}
              className="hidden"
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {content.media.map(media => (
              <div key={media.id} className="relative group">
                {media.type === 'image' ? (
                  <img src={media.url} alt="Media" className="w-full h-32 object-cover rounded" />
                ) : (
                  <video src={media.url} className="w-full h-32 object-cover rounded" />
                )}
                <button
                  onClick={() => handleRemoveMedia(media.id)}
                  className="absolute top-2 right-2 p-1 bg-red-600 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Buttons */}
      {activeTab === 'buttons' && (
        <div className="space-y-4">
          <button
            onClick={handleAddButton}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
          >
            <Plus className="h-4 w-4" />
            <span>Add Button</span>
          </button>
          {content.buttons.map(button => (
            <div key={button.id} className="bg-neutral-800 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-400">Button</span>
                <button
                  onClick={() => handleRemoveButton(button.id)}
                  className="text-red-400 hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <input
                type="text"
                value={button.label}
                onChange={(e) => handleUpdateButton(button.id, { label: e.target.value })}
                placeholder="Button label"
                className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded text-white text-sm"
              />
              <input
                type="url"
                value={button.url}
                onChange={(e) => handleUpdateButton(button.id, { url: e.target.value })}
                placeholder="https://..."
                className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded text-white text-sm"
              />
              <select
                value={button.style}
                onChange={(e) => handleUpdateButton(button.id, { style: e.target.value as any })}
                className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded text-white text-sm"
              >
                <option value="primary">Primary</option>
                <option value="secondary">Secondary</option>
                <option value="link">Link</option>
              </select>
            </div>
          ))}
        </div>
      )}

      {/* Polls */}
      {activeTab === 'polls' && (
        <div className="space-y-4">
          <button
            onClick={handleAddPoll}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
          >
            <Plus className="h-4 w-4" />
            <span>Add Poll</span>
          </button>
          {content.polls.map(poll => (
            <div key={poll.id} className="bg-neutral-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-400">Poll</span>
                <button
                  onClick={() => handleRemovePoll(poll.id)}
                  className="text-red-400 hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <input
                type="text"
                value={poll.question}
                onChange={(e) => handleUpdatePoll(poll.id, { question: e.target.value })}
                placeholder="Poll question"
                className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded text-white text-sm"
              />
              <div className="space-y-2">
                {poll.options.map((option, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={option}
                      onChange={(e) => {
                        const newOptions = [...poll.options];
                        newOptions[index] = e.target.value;
                        handleUpdatePoll(poll.id, { options: newOptions });
                      }}
                      placeholder={`Option ${index + 1}`}
                      className="flex-1 px-3 py-2 bg-neutral-700 border border-neutral-600 rounded text-white text-sm"
                    />
                    {poll.options.length > 2 && (
                      <button
                        onClick={() => handleRemovePollOption(poll.id, index)}
                        className="text-red-400 hover:text-red-300"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => handleAddPollOption(poll.id)}
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  + Add Option
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Forms */}
      {activeTab === 'forms' && (
        <div className="space-y-4">
          <button
            onClick={handleAddForm}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
          >
            <Plus className="h-4 w-4" />
            <span>Add Form</span>
          </button>
          {content.forms.map(form => (
            <div key={form.id} className="bg-neutral-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-400">Form</span>
                <button
                  onClick={() => handleRemoveForm(form.id)}
                  className="text-red-400 hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <input
                type="text"
                value={form.title}
                onChange={(e) => handleUpdateForm(form.id, { title: e.target.value })}
                placeholder="Form title"
                className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded text-white text-sm"
              />
              <div className="space-y-2">
                {form.fields.map(field => (
                  <div key={field.id} className="bg-neutral-700 rounded p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <input
                        type="text"
                        value={field.name}
                        onChange={(e) => {
                          const newFields = form.fields.map(f => 
                            f.id === field.id ? { ...f, name: e.target.value } : f
                          );
                          handleUpdateForm(form.id, { fields: newFields });
                        }}
                        placeholder="Field name"
                        className="flex-1 px-2 py-1 bg-neutral-600 border border-neutral-500 rounded text-white text-sm mr-2"
                      />
                      <select
                        value={field.type}
                        onChange={(e) => {
                          const newFields = form.fields.map(f => 
                            f.id === field.id ? { ...f, type: e.target.value as any } : f
                          );
                          handleUpdateForm(form.id, { fields: newFields });
                        }}
                        className="px-2 py-1 bg-neutral-600 border border-neutral-500 rounded text-white text-sm mr-2"
                      >
                        <option value="text">Text</option>
                        <option value="email">Email</option>
                        <option value="textarea">Textarea</option>
                        <option value="select">Select</option>
                      </select>
                      <label className="flex items-center space-x-1 text-sm text-neutral-300">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) => {
                            const newFields = form.fields.map(f => 
                              f.id === field.id ? { ...f, required: e.target.checked } : f
                            );
                            handleUpdateForm(form.id, { fields: newFields });
                          }}
                        />
                        <span>Required</span>
                      </label>
                      <button
                        onClick={() => handleRemoveFormField(form.id, field.id)}
                        className="text-red-400 hover:text-red-300"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => handleAddFormField(form.id)}
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  + Add Field
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end space-x-3 mt-6 pt-4 border-t border-neutral-700">
        {onCancel && (
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-neutral-300 hover:text-white transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {isSubmitting ? 'Publishing...' : 'Publish'}
        </button>
      </div>
    </div>
  );
};


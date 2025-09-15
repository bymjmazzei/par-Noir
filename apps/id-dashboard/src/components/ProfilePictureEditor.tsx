import React, { useState, useRef } from 'react';
import { Upload, Link, Smile, X, CheckCircle } from 'lucide-react';
import { ThemeAwareProfileImage } from './ThemeAwareProfileImage';

interface ProfilePictureEditorProps {
  currentPicture?: string;
  onSave: (pictureData: string) => void;
  onCancel: () => void;
  isOpen: boolean;
}

// Emoji database with names for searchable emojis
const EMOJI_DATABASE = [
  { emoji: '😀', name: 'grinning face' },
  { emoji: '😃', name: 'grinning face with big eyes' },
  { emoji: '😄', name: 'grinning face with smiling eyes' },
  { emoji: '😁', name: 'beaming face with smiling eyes' },
  { emoji: '😆', name: 'grinning squinting face' },
  { emoji: '😅', name: 'grinning face with sweat' },
  { emoji: '😂', name: 'face with tears of joy' },
  { emoji: '🤣', name: 'rolling on the floor laughing' },
  { emoji: '😊', name: 'smiling face with smiling eyes' },
  { emoji: '😇', name: 'smiling face with halo' },
  { emoji: '🙂', name: 'slightly smiling face' },
  { emoji: '🙃', name: 'upside down face' },
  { emoji: '😉', name: 'winking face' },
  { emoji: '😌', name: 'relieved face' },
  { emoji: '😍', name: 'smiling face with heart eyes' },
  { emoji: '🥰', name: 'smiling face with hearts' },
  { emoji: '😘', name: 'face blowing a kiss' },
  { emoji: '😗', name: 'kissing face' },
  { emoji: '😙', name: 'kissing face with smiling eyes' },
  { emoji: '😚', name: 'kissing face with closed eyes' },
  { emoji: '😋', name: 'face savoring food' },
  { emoji: '😛', name: 'face with tongue' },
  { emoji: '😝', name: 'squinting face with tongue' },
  { emoji: '😜', name: 'winking face with tongue' },
  { emoji: '🤪', name: 'zany face' },
  { emoji: '🤨', name: 'face with raised eyebrow' },
  { emoji: '🧐', name: 'face with monocle' },
  { emoji: '🤓', name: 'nerd face' },
  { emoji: '😎', name: 'smiling face with sunglasses' },
  { emoji: '🤩', name: 'star struck' },
  { emoji: '🥳', name: 'partying face' },
  { emoji: '😏', name: 'smirking face' },
  { emoji: '😒', name: 'unamused face' },
  { emoji: '😞', name: 'disappointed face' },
  { emoji: '😔', name: 'pensive face' },
  { emoji: '😟', name: 'worried face' },
  { emoji: '😕', name: 'confused face' },
  { emoji: '🙁', name: 'slightly frowning face' },
  { emoji: '☹️', name: 'frowning face' },
  { emoji: '😣', name: 'persevering face' },
  { emoji: '😖', name: 'confounded face' },
  { emoji: '😫', name: 'tired face' },
  { emoji: '😩', name: 'weary face' },
  { emoji: '🥺', name: 'pleading face' },
  { emoji: '😢', name: 'crying face' },
  { emoji: '😭', name: 'loudly crying face' },
  { emoji: '😤', name: 'face with steam from nose' },
  { emoji: '😠', name: 'angry face' },
  { emoji: '😡', name: 'pouting face' },
  { emoji: '🤬', name: 'face with symbols on mouth' },
  { emoji: '🤯', name: 'exploding head' },
  { emoji: '😳', name: 'flushed face' },
  { emoji: '🥵', name: 'hot face' },
  { emoji: '🥶', name: 'cold face' },
  { emoji: '😱', name: 'face screaming in fear' },
  { emoji: '😨', name: 'fearful face' },
  { emoji: '😰', name: 'anxious face with sweat' },
  { emoji: '😥', name: 'sad but relieved face' },
  { emoji: '😓', name: 'downcast face with sweat' },
  { emoji: '🤗', name: 'hugging face' },
  { emoji: '🤔', name: 'thinking face' },
  { emoji: '🤭', name: 'face with hand over mouth' },
  { emoji: '🤫', name: 'shushing face' },
  { emoji: '🤥', name: 'lying face' },
  { emoji: '😶', name: 'face without mouth' },
  { emoji: '😐', name: 'neutral face' },
  { emoji: '😑', name: 'expressionless face' },
  { emoji: '😯', name: 'hushed face' },
  { emoji: '😦', name: 'frowning face with open mouth' },
  { emoji: '😧', name: 'anguished face' },
  { emoji: '😮', name: 'face with open mouth' },
  { emoji: '😲', name: 'astonished face' },
  { emoji: '🥱', name: 'yawning face' },
  { emoji: '😴', name: 'sleeping face' },
  { emoji: '🤤', name: 'drooling face' },
  { emoji: '😪', name: 'sleepy face' },
  { emoji: '😵', name: 'dizzy face' },
  { emoji: '🤐', name: 'zipper mouth face' },
  { emoji: '🥴', name: 'woozy face' },
  { emoji: '🤢', name: 'nauseated face' },
  { emoji: '🤮', name: 'face vomiting' },
  { emoji: '🤧', name: 'sneezing face' },
  { emoji: '😷', name: 'face with medical mask' },
  { emoji: '🤒', name: 'face with thermometer' },
  { emoji: '🤕', name: 'face with head bandage' },
  { emoji: '🤑', name: 'money mouth face' },
  { emoji: '🤠', name: 'cowboy hat face' },
  { emoji: '💩', name: 'pile of poo' },
  { emoji: '🤡', name: 'clown face' },
  { emoji: '👹', name: 'ogre' },
  { emoji: '👺', name: 'goblin' },
  { emoji: '👻', name: 'ghost' },
  { emoji: '👽', name: 'alien' },
  { emoji: '👾', name: 'alien monster' },
  { emoji: '🤖', name: 'robot' },
  { emoji: '😺', name: 'grinning cat' },
  { emoji: '😸', name: 'grinning cat with smiling eyes' },
  { emoji: '😹', name: 'cat with tears of joy' },
  { emoji: '😻', name: 'heart eyes cat' },
  { emoji: '😼', name: 'cat with wry smile' },
  { emoji: '😽', name: 'kissing cat' },
  { emoji: '🙀', name: 'weary cat' },
  { emoji: '😿', name: 'crying cat' },
  { emoji: '😾', name: 'pouting cat' },
  { emoji: '🙈', name: 'see no evil monkey' },
  { emoji: '🙉', name: 'hear no evil monkey' },
  { emoji: '🙊', name: 'speak no evil monkey' },
  { emoji: '💌', name: 'love letter' },
  { emoji: '💘', name: 'heart with arrow' },
  { emoji: '💝', name: 'heart with ribbon' },
  { emoji: '💖', name: 'sparkling heart' },
  { emoji: '💗', name: 'growing heart' },
  { emoji: '💓', name: 'beating heart' },
  { emoji: '💞', name: 'revolving hearts' },
  { emoji: '💕', name: 'two hearts' },
  { emoji: '💟', name: 'heart decoration' },
  { emoji: '❣️', name: 'heart exclamation' },
  { emoji: '💔', name: 'broken heart' },
  { emoji: '❤️', name: 'red heart' },
  { emoji: '🧡', name: 'orange heart' },
  { emoji: '💛', name: 'yellow heart' },
  { emoji: '💚', name: 'green heart' },
  { emoji: '💙', name: 'blue heart' },
  { emoji: '💜', name: 'purple heart' },
  { emoji: '🖤', name: 'black heart' },
  { emoji: '💯', name: 'hundred points' },
  { emoji: '💢', name: 'anger symbol' },
  { emoji: '💥', name: 'collision' },
  { emoji: '💫', name: 'dizzy' },
  { emoji: '💦', name: 'sweat droplets' },
  { emoji: '💨', name: 'dashing away' },
  { emoji: '🕳️', name: 'hole' },
  { emoji: '💬', name: 'speech balloon' },
  { emoji: '🗨️', name: 'left speech bubble' },
  { emoji: '🗯️', name: 'right anger bubble' },
  { emoji: '💭', name: 'thought balloon' },
  { emoji: '💤', name: 'zzz' },
  { emoji: '🌐', name: 'globe with meridians' },
  { emoji: '🗺️', name: 'world map' },
  { emoji: '🧭', name: 'compass' },
  { emoji: '🏔️', name: 'mountain' },
  { emoji: '⛰️', name: 'mountain' },
  { emoji: '🌋', name: 'volcano' },
  { emoji: '🗻', name: 'mount fuji' },
  { emoji: '🏕️', name: 'camping' },
  { emoji: '🏖️', name: 'beach with umbrella' },
  { emoji: '🏜️', name: 'desert' },
  { emoji: '🏝️', name: 'desert island' },
  { emoji: '🏞️', name: 'national park' },
  { emoji: '🏟️', name: 'stadium' },
  { emoji: '🏛️', name: 'classical building' },
  { emoji: '🏗️', name: 'building construction' },
  { emoji: '🧱', name: 'brick' },
  { emoji: '🪨', name: 'rock' },
  { emoji: '🪵', name: 'wood' },
  { emoji: '🛖', name: 'hut' },
  { emoji: '🏘️', name: 'houses' },
  { emoji: '🏚️', name: 'derelict house' },
  { emoji: '🏠', name: 'house' },
  { emoji: '🏡', name: 'house with garden' },
  { emoji: '🏢', name: 'office building' },
  { emoji: '🏣', name: 'japanese post office' },
  { emoji: '🏤', name: 'post office' },
  { emoji: '🏥', name: 'hospital' },
  { emoji: '🏦', name: 'bank' },
  { emoji: '🏨', name: 'hotel' },
  { emoji: '🏩', name: 'love hotel' },
  { emoji: '🏪', name: 'convenience store' },
  { emoji: '🏫', name: 'school' },
  { emoji: '🏬', name: 'department store' },
  { emoji: '🏭', name: 'factory' },
  { emoji: '🏯', name: 'japanese castle' },
  { emoji: '🏰', name: 'castle' },
  { emoji: '💒', name: 'wedding' },
  { emoji: '🗼', name: 'tokyo tower' },
  { emoji: '🗽', name: 'statue of liberty' },
  { emoji: '⛪', name: 'church' },
  { emoji: '🕌', name: 'mosque' },
  { emoji: '🛕', name: 'hindu temple' },
  { emoji: '🕍', name: 'synagogue' },
  { emoji: '⛩️', name: 'shinto shrine' },
  { emoji: '🕋', name: 'kaaba' },
  { emoji: '⛲', name: 'fountain' },
  { emoji: '⛺', name: 'tent' },
  { emoji: '🌁', name: 'foggy' },
  { emoji: '🌃', name: 'night with stars' },
  { emoji: '🏙️', name: 'cityscape' },
  { emoji: '🌄', name: 'sunrise over mountains' },
  { emoji: '🌅', name: 'sunrise' },
  { emoji: '🌆', name: 'cityscape at dusk' },
  { emoji: '🌇', name: 'sunset' },
  { emoji: '🌉', name: 'bridge at night' },
  { emoji: '♨️', name: 'hot springs' },
  { emoji: '🎠', name: 'carousel horse' },
  { emoji: '🎡', name: 'ferris wheel' },
  { emoji: '🎢', name: 'roller coaster' },
  { emoji: '💈', name: 'barber pole' },
  { emoji: '🎪', name: 'circus tent' },
  { emoji: '🚂', name: 'locomotive' },
  { emoji: '🚃', name: 'railway car' },
  { emoji: '🚄', name: 'high speed train' },
  { emoji: '🚅', name: 'bullet train' },
  { emoji: '🚆', name: 'train' },
  { emoji: '🚇', name: 'metro' },
  { emoji: '🚈', name: 'light rail' },
  { emoji: '🚉', name: 'station' },
  { emoji: '🚊', name: 'tram' },
  { emoji: '🚝', name: 'monorail' },
  { emoji: '🚞', name: 'mountain railway' },
  { emoji: '🚋', name: 'tram car' },
  { emoji: '🚌', name: 'bus' },
  { emoji: '🚍', name: 'oncoming bus' },
  { emoji: '🚎', name: 'trolleybus' },
  { emoji: '🚐', name: 'minibus' },
  { emoji: '🚑', name: 'ambulance' },
  { emoji: '🚒', name: 'fire engine' },
  { emoji: '🚓', name: 'police car' },
  { emoji: '🚔', name: 'oncoming police car' },
  { emoji: '🚕', name: 'taxi' },
  { emoji: '🚖', name: 'oncoming taxi' },
  { emoji: '🚗', name: 'automobile' },
  { emoji: '🚘', name: 'oncoming automobile' },
  { emoji: '🚙', name: 'sport utility vehicle' },
  { emoji: '🚚', name: 'delivery truck' },
  { emoji: '🚛', name: 'articulated lorry' },
  { emoji: '🚜', name: 'tractor' },
  { emoji: '🏎️', name: 'racing car' },
  { emoji: '🏍️', name: 'motorcycle' },
  { emoji: '🛵', name: 'motor scooter' },
  { emoji: '🦽', name: 'manual wheelchair' },
  { emoji: '🦼', name: 'motorized wheelchair' },
  { emoji: '🛴', name: 'kick scooter' },
  { emoji: '🚲', name: 'bicycle' },
  { emoji: '🛺', name: 'auto rickshaw' },
  { emoji: '🛻', name: 'pickup truck' },
  { emoji: '🚁', name: 'helicopter' },
  { emoji: '🚟', name: 'suspension railway' },
  { emoji: '🚠', name: 'mountain cableway' },
  { emoji: '🚡', name: 'aerial tramway' },
  { emoji: '🛰️', name: 'satellite' },
  { emoji: '🚀', name: 'rocket' },
  { emoji: '🛸', name: 'flying saucer' },
  { emoji: '🛩️', name: 'small airplane' },
  { emoji: '🛫', name: 'airplane departure' },
  { emoji: '🛬', name: 'airplane arrival' },
  { emoji: '🪂', name: 'parachute' },
  { emoji: '💺', name: 'seat' },
  { emoji: '🛶', name: 'canoe' },
  { emoji: '⛵', name: 'sailboat' },
  { emoji: '🛥️', name: 'motor boat' },
  { emoji: '🚤', name: 'speedboat' },
  { emoji: '🛳️', name: 'passenger ship' },
  { emoji: '⛴️', name: 'ferry' },
  { emoji: '🚢', name: 'ship' },
  { emoji: '⚓', name: 'anchor' },
  { emoji: '🚧', name: 'construction' },
  { emoji: '⛽', name: 'fuel pump' },
  { emoji: '🚨', name: 'rotating light' },
  { emoji: '🚥', name: 'horizontal traffic light' },
  { emoji: '🚦', name: 'vertical traffic light' },
  { emoji: '🛑', name: 'stop sign' },
  { emoji: '🚏', name: 'bus stop' },
  { emoji: '🗺️', name: 'world map' },
  { emoji: '🗿', name: 'moai' },
  { emoji: '🎪', name: 'circus tent' },
  { emoji: '🎭', name: 'performing arts' },
  { emoji: '🎨', name: 'artist palette' },
  { emoji: '🎬', name: 'clapper board' },
  { emoji: '🎤', name: 'microphone' },
  { emoji: '🎧', name: 'headphone' },
  { emoji: '🎼', name: 'musical score' },
  { emoji: '🎹', name: 'musical keyboard' },
  { emoji: '🥁', name: 'drum' },
  { emoji: '🎷', name: 'saxophone' },
  { emoji: '🎺', name: 'trumpet' },
  { emoji: '🎸', name: 'guitar' },
  { emoji: '🪕', name: 'banjo' },
  { emoji: '🎻', name: 'violin' },
  { emoji: '🎲', name: 'game die' },
  { emoji: '♟️', name: 'chess pawn' },
  { emoji: '🎯', name: 'direct hit' },
  { emoji: '🎳', name: 'bowling' },
  { emoji: '🎮', name: 'video game' },
  { emoji: '🎰', name: 'slot machine' },
  { emoji: '🧩', name: 'puzzle piece' },
  { emoji: '📱', name: 'mobile phone' },
  { emoji: '📲', name: 'mobile phone with arrow' },
  { emoji: '💻', name: 'laptop' },
  { emoji: '⌨️', name: 'keyboard' },
  { emoji: '🖥️', name: 'desktop computer' },
  { emoji: '🖨️', name: 'printer' },
  { emoji: '🖱️', name: 'computer mouse' },
  { emoji: '🖲️', name: 'trackball' },
  { emoji: '🕹️', name: 'joystick' }
];

export const ProfilePictureEditor: React.FC<ProfilePictureEditorProps> = ({
  currentPicture,
  onSave,
  onCancel,
  isOpen
}) => {
  const [pictureUrl, setPictureUrl] = useState(currentPicture || '');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState(currentPicture || '');
  const [inputMethod, setInputMethod] = useState<'emoji' | 'url' | 'file'>('emoji');
  const [selectedEmoji, setSelectedEmoji] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emojiSearch, setEmojiSearch] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Image size must be less than 5MB');
      return;
    }

    setError(null);
    setUploadedFile(file);

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setPreviewUrl(result);
    };
    reader.readAsDataURL(file);
  };

  const handleUrlChange = (url: string) => {
    setPictureUrl(url);
    setError(null);
    
    if (url.trim()) {
      // Validate URL format
      try {
        new URL(url);
        setPreviewUrl(url);
      } catch {
        setError('Please enter a valid URL');
        setPreviewUrl('');
      }
    } else {
      setPreviewUrl('');
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    setSelectedEmoji(emoji);
    setPreviewUrl(`data:image/svg+xml;base64,${btoa(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <rect width="100" height="100" fill="#f0f0f0"/>
        <text x="50" y="50" font-size="60" text-anchor="middle" dy=".3em">${emoji}</text>
      </svg>
    `)}`);
    setEmojiSearch('');
    setError(null);
  };

  // Filter emojis based on search term (emoji character or name)
  const filteredEmojis = EMOJI_DATABASE.filter(item => 
    emojiSearch === '' || 
    item.emoji.includes(emojiSearch) || 
    item.name.toLowerCase().includes(emojiSearch.toLowerCase())
  );

  const handleSave = async () => {
    setIsLoading(true);
    setError(null);

    try {
      let finalPictureData = '';

      if (inputMethod === 'emoji' && selectedEmoji) {
        // Convert emoji to SVG data URL
        finalPictureData = `data:image/svg+xml;base64,${btoa(`
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
            <rect width="100" height="100" fill="#f0f0f0"/>
            <text x="50" y="50" font-size="60" text-anchor="middle" dy=".3em">${selectedEmoji}</text>
          </svg>
        `)}`;
      } else if (inputMethod === 'file' && uploadedFile) {
        // Convert file to base64
        const reader = new FileReader();
        finalPictureData = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.readAsDataURL(uploadedFile);
        });
      } else if (inputMethod === 'url' && pictureUrl.trim()) {
        // Use URL directly
        finalPictureData = pictureUrl.trim();
      }

      onSave(finalPictureData);
    } catch (error) {
      setError('Failed to process image. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemove = () => {
    onSave(''); // Save empty string to remove picture
  };

  const resetForm = () => {
    setPictureUrl(currentPicture || '');
    setUploadedFile(null);
    setPreviewUrl(currentPicture || '');
    setSelectedEmoji('');
    setEmojiSearch('');
    setError(null);
    setInputMethod('emoji');
  };

  React.useEffect(() => {
    if (isOpen) {
      resetForm();
    }
  }, [isOpen, currentPicture]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-modal-bg rounded-lg p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto text-gray-900 dark:text-text-primary">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">Edit Profile Picture</h2>
          <button
            onClick={onCancel}
            className="text-gray-500 dark:text-text-secondary hover:text-gray-700 dark:hover:text-text-primary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Profile Picture Display */}
        <div className="mb-6 text-center">
          <div className="inline-block relative">
            <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-gray-300 dark:border-border mx-auto">
              {currentPicture ? (
                <img
                  src={currentPicture}
                  alt="Current profile picture"
                  className="w-full h-full object-cover"
                />
              ) : (
                <ThemeAwareProfileImage
                  className="w-full h-full object-cover"
                />
              )}
            </div>
            <div className="mt-2 text-sm text-gray-600 dark:text-text-secondary">
              Current Profile Picture
            </div>
          </div>
        </div>

        {/* Method Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-text-primary mb-3">
            Choose Input Method
          </label>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setInputMethod('emoji')}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors border-2 ${
                inputMethod === 'emoji'
                  ? 'bg-blue-600 dark:bg-primary text-white border-green-500'
                  : 'bg-gray-100 dark:bg-secondary text-gray-700 dark:text-text-primary hover:bg-gray-200 dark:hover:bg-border border-transparent'
              }`}
            >
              <Smile className="w-4 h-4" />
              Emoji
            </button>
            <button
              onClick={() => setInputMethod('url')}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors border-2 ${
                inputMethod === 'url'
                  ? 'bg-blue-600 dark:bg-primary text-white border-green-500'
                  : 'bg-gray-100 dark:bg-secondary text-gray-700 dark:text-text-primary hover:bg-gray-200 dark:hover:bg-border border-transparent'
              }`}
            >
              <Link className="w-4 h-4" />
              URL
            </button>
            <button
              onClick={() => setInputMethod('file')}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors border-2 ${
                inputMethod === 'file'
                  ? 'bg-blue-600 dark:bg-primary text-white border-green-500'
                  : 'bg-gray-100 dark:bg-secondary text-gray-700 dark:text-text-primary hover:bg-gray-200 dark:hover:bg-border border-transparent'
              }`}
            >
              <Upload className="w-4 h-4" />
              Upload
            </button>
          </div>
        </div>

        {/* Emoji Selection */}
        {inputMethod === 'emoji' && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-text-primary mb-3">
              Search and Select an Emoji
            </label>
            
            {/* Search Bar */}
            <div className="mb-4">
              <input
                type="text"
                value={emojiSearch}
                onChange={(e) => setEmojiSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setEmojiSearch('');
                  }
                }}
                placeholder="Search by name (e.g., &apos;smile&apos;, &apos;heart&apos;, &apos;house&apos;) or emoji..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-border rounded-lg bg-white dark:bg-modal-bg text-gray-900 dark:text-text-primary focus:ring-2 focus:ring-blue-500 dark:focus:ring-primary focus:border-transparent transition-colors text-sm"
                autoFocus
              />
              {!emojiSearch && (
                <div className="mt-2 text-xs text-gray-500 dark:text-text-secondary">
                  Try: &quot;smile&quot;, &quot;heart&quot;, &quot;house&quot;, &quot;car&quot;, &quot;music&quot;, &quot;food&quot;, &quot;animal&quot;
                </div>
              )}
            </div>
            
            {/* Emoji Grid */}
            <div className="p-4 border border-gray-300 dark:border-border rounded-lg bg-gray-50 dark:bg-secondary max-h-60 overflow-y-auto">
              <div className="grid grid-cols-8 gap-2">
                {filteredEmojis.length > 0 ? (
                  filteredEmojis.map((item, index) => (
                    <button
                      key={index}
                      onClick={() => handleEmojiSelect(item.emoji)}
                      className="w-8 h-8 text-xl hover:bg-gray-200 dark:hover:bg-border rounded transition-colors flex items-center justify-center"
                      title={item.name}
                    >
                      {item.emoji}
                    </button>
                  ))
                ) : (
                  <div className="col-span-8 text-center py-4 text-gray-500 dark:text-text-secondary text-sm">
                    No emojis found for &quot;{emojiSearch}&quot;
                  </div>
                )}
              </div>
              
              {/* Search Results Info */}
              {emojiSearch && (
                <div className="mt-3 text-xs text-gray-500 dark:text-text-secondary text-center">
                  Showing {filteredEmojis.length} of {EMOJI_DATABASE.length} emojis
                </div>
              )}
            </div>
          </div>
        )}

        {/* URL Input */}
        {inputMethod === 'url' && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-text-primary mb-2">
              Image URL
            </label>
            <input
              type="url"
              value={pictureUrl}
              onChange={(e) => handleUrlChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-border rounded-lg bg-white dark:bg-modal-bg text-gray-900 dark:text-text-primary focus:ring-2 focus:ring-blue-500 dark:focus:ring-primary focus:border-transparent transition-colors"
              placeholder="https://example.com/image.jpg"
            />
          </div>
        )}

        {/* File Upload */}
        {inputMethod === 'file' && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-text-primary mb-3">
              Upload Image
            </label>
            <div className="relative">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="border-2 border-dashed border-gray-300 dark:border-border rounded-lg p-8 text-center hover:border-blue-500 dark:hover:border-primary transition-colors cursor-pointer bg-gray-50 dark:bg-secondary">
                <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400 dark:text-text-secondary" />
                <div className="text-lg font-medium text-gray-700 dark:text-text-primary mb-2">
                  Click to upload or drag and drop
                </div>
                <div className="text-sm text-gray-500 dark:text-text-secondary">
                  JPG, PNG, GIF, WebP up to 5MB
                </div>
              </div>
            </div>
            {uploadedFile && (
              <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                  <span className="text-sm text-green-800 dark:text-green-300">
                    File selected: {uploadedFile.name}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Preview */}
        {previewUrl && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-text-primary mb-3">
              Preview
            </label>
            <div className="flex justify-center">
              <div className="relative">
                <img
                  src={previewUrl}
                  alt="Profile preview"
                  className="w-24 h-24 rounded-full object-cover border-2 border-gray-300 dark:border-border"
                  onError={() => setError('Failed to load image. Please check the URL or try a different image.')}
                />
                <div className="absolute -top-1 -right-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 text-white" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3">
            <p className="text-red-800 dark:text-red-300 text-sm">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex space-x-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-border rounded-lg text-gray-700 dark:text-text-primary hover:bg-gray-100 dark:hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
          {currentPicture && (
            <button
              onClick={handleRemove}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Remove
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={isLoading || 
              (inputMethod === 'emoji' && !selectedEmoji) ||
              (inputMethod === 'url' && !pictureUrl.trim()) || 
              (inputMethod === 'file' && !uploadedFile)}
            className="flex-1 px-4 py-2 bg-blue-600 dark:bg-primary text-white rounded-lg hover:bg-blue-700 dark:hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};
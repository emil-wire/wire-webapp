/*
 * Wire
 * Copyright (C) 2021 Wire Swiss GmbH
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see http://www.gnu.org/licenses/.
 *
 */

import React, {useEffect, useRef, useState} from 'react';

import {CSSObject} from '@emotion/react';
import cx from 'classnames';
import {container} from 'tsyringe';

import {RestrictedImage} from 'Components/asset/RestrictedImage';
import {Icon} from 'Components/Icon';
import {InViewport} from 'Components/utils/InViewport';
import {useKoSubscribableChildren} from 'Util/ComponentUtil';
import {handleKeyDown} from 'Util/KeyboardUtil';
import {t} from 'Util/LocalizerUtil';

import {AssetLoader} from './AssetLoader';
import {AssetUrl, useAssetTransfer} from './useAssetTransfer';

import {Config} from '../../../../../Config';
import {ContentMessage} from '../../../../../entity/message/ContentMessage';
import {MediumImage} from '../../../../../entity/message/MediumImage';
import {TeamState} from '../../../../../team/TeamState';
import {useMessageFocusedTabIndex} from '../../util';

export interface ImageAssetProps {
  asset: MediumImage;
  message: ContentMessage;
  onClick: (message: ContentMessage, event: React.MouseEvent | React.KeyboardEvent) => void;
  teamState?: TeamState;
  isFocusable?: boolean;
}

export const ImageAsset: React.FC<ImageAssetProps> = ({
  asset,
  message,
  onClick,
  teamState = container.resolve(TeamState),
  isFocusable = true,
}) => {
  const [imageUrl, setImageUrl] = useState<AssetUrl>();
  const {resource} = useKoSubscribableChildren(asset, ['resource']);
  const {isObfuscated, visible} = useKoSubscribableChildren(message, ['isObfuscated', 'visible']);
  const {isFileSharingReceivingEnabled} = useKoSubscribableChildren(teamState, ['isFileSharingReceivingEnabled']);
  const [isInViewport, setIsInViewport] = useState(false);
  const {isUploading, uploadProgress, cancelUpload, getAssetUrl} = useAssetTransfer(message);
  const messageFocusedTabIndex = useMessageFocusedTabIndex(isFocusable);

  /** keeps track of whether the component is mounted or not to avoid setting the image url in case it's not */
  const isUnmouted = useRef(false);

  useEffect(() => {
    if (!imageUrl && isInViewport && resource && isFileSharingReceivingEnabled) {
      (async () => {
        try {
          const allowedImageTypes = [
            'application/octet-stream', // Octet-stream is required to paste images from clipboard
            ...Config.getConfig().ALLOWED_IMAGE_TYPES,
          ];
          const url = await getAssetUrl(resource, allowedImageTypes);
          if (isUnmouted.current) {
            // Avoid re-rendering a component that is umounted
            return;
          }
          setImageUrl(url);
        } catch (error) {
          console.error(error);
        }
      })();
    }
  }, [imageUrl, isInViewport, resource, isFileSharingReceivingEnabled, getAssetUrl]);

  useEffect(() => {
    return () => {
      isUnmouted.current = true;
      imageUrl?.dispose();
    };
  }, []);

  const dummyImageUrl = `data:image/svg+xml;utf8,<svg aria-hidden="true" xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1' width='${asset.width}' height='${asset.height}'></svg>`;

  const imageAltText = t('accessibility.conversationAssetImageAlt', {
    messageDate: `${message.displayTimestampShort()}`,
    username: `${message.user().name()}`,
  });

  const imageContainerStyle: CSSObject = {
    aspectRatio: isFileSharingReceivingEnabled ? `${asset.ratio}` : undefined,
    maxWidth: '100%',
    width: asset.width,
    maxHeight: '80vh',
  };

  return (
    <div data-uie-name="image-asset" css={imageContainerStyle}>
      {isFileSharingReceivingEnabled ? (
        <InViewport
          className={cx('image-asset', {
            'bg-color-ephemeral': isObfuscated,
            'image-asset--no-image': !isObfuscated && !imageUrl,
            'loading-dots': !isUploading && !resource && !isObfuscated,
          })}
          data-uie-visible={visible && !isObfuscated}
          data-uie-status={imageUrl ? 'loaded' : 'loading'}
          onClick={event => onClick(message, event)}
          onKeyDown={event => handleKeyDown(event, () => onClick(message, event))}
          tabIndex={messageFocusedTabIndex}
          role="button"
          data-uie-name="go-image-detail"
          aria-label={imageAltText}
          onVisible={() => setIsInViewport(true)}
        >
          {isUploading && (
            <div className="asset-loader">
              <AssetLoader loadProgress={uploadProgress} onCancel={cancelUpload} />
            </div>
          )}

          {isObfuscated && (
            <div className="image-icon flex-center full-screen">
              <Icon.Image />
            </div>
          )}
          <img
            data-uie-name="image-asset-img"
            className={cx('image-element', {'image-ephemeral': isObfuscated})}
            src={imageUrl?.url || dummyImageUrl}
            alt={imageAltText}
          />
        </InViewport>
      ) : (
        <RestrictedImage />
      )}
    </div>
  );
};

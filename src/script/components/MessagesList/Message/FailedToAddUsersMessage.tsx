/*
 * Wire
 * Copyright (C) 2023 Wire Swiss GmbH
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

import React, {ReactNode, useMemo, useState} from 'react';

import {AddUsersFailureReasons} from '@wireapp/core/lib/conversation';
import {container} from 'tsyringe';

import {Button, ButtonVariant, Link, LinkVariant} from '@wireapp/react-ui-kit';

import {Icon} from 'Components/Icon';
import {getUserName} from 'Components/UserName';
import {Config} from 'src/script/Config';
import {User} from 'src/script/entity/User';
import {UserState} from 'src/script/user/UserState';
import {useKoSubscribableChildren} from 'Util/ComponentUtil';
import {t} from 'Util/LocalizerUtil';
import {matchQualifiedIds} from 'Util/QualifiedId';

import {backendErrorLink, warning} from './ContentMessage/Warnings/Warnings.styles';
import {MessageTime} from './MessageTime';
import {useMessageFocusedTabIndex} from './util';

import {FailedToAddUsersMessage as FailedToAddUsersMessageEntity} from '../../../entity/message/FailedToAddUsersMessage';

export interface FailedToAddUsersMessageProps {
  isMessageFocused: boolean;
  message: FailedToAddUsersMessageEntity;
  userState?: UserState;
}

const errorMessageType = {
  [AddUsersFailureReasons.NON_FEDERATING_BACKENDS]: 'NonFederatingBackends',
  [AddUsersFailureReasons.UNREACHABLE_BACKENDS]: 'OfflineBackend',
} as const;

const config = Config.getConfig();

interface MessageDetailsProps {
  children: ReactNode;
  users: User[];
  reason: AddUsersFailureReasons;
  domains: string[];
}
const MessageDetails = ({users, children, reason, domains}: MessageDetailsProps) => {
  const baseTranslationKey =
    users.length === 1 ? 'failedToAddParticipantsSingularDetails' : 'failedToAddParticipantsPluralDetails';

  const uniqueDomains = Array.from(new Set(domains));

  const domainStr = uniqueDomains.join(', ');

  return (
    <p
      data-uie-name="multi-user-not-added-details"
      data-uie-value={domainStr}
      style={{lineHeight: 'var(--line-height-sm)'}}
    >
      <span
        css={warning}
        dangerouslySetInnerHTML={{
          __html: t(`${baseTranslationKey}${errorMessageType[reason]}`, {
            name: getUserName(users[0]),
            names: users
              .slice(1)
              .map(user => getUserName(user))
              .join(', '),
            domain: domainStr,
          }),
        }}
      />
      {children}
    </p>
  );
};

const FailedToAddUsersMessage: React.FC<FailedToAddUsersMessageProps> = ({
  isMessageFocused,
  message,
  userState = container.resolve(UserState),
}) => {
  const messageFocusedTabIndex = useMessageFocusedTabIndex(isMessageFocused);

  const [isOpen, setIsOpen] = useState(false);
  const {timestamp} = useKoSubscribableChildren(message, ['timestamp']);

  const {users: allUsers} = useKoSubscribableChildren(userState, ['users']);

  const [users, total] = useMemo(() => {
    const users: User[] = message.qualifiedIds.reduce<User[]>((previous, current) => {
      const foundUser = allUsers.find(user => matchQualifiedIds(current, user.qualifiedId));
      return foundUser ? [...previous, foundUser] : previous;
    }, []);
    const total = users.length;
    return [users, total];
  }, [allUsers, message.qualifiedIds]);

  if (users.length === 0) {
    return null;
  }

  const learnMore = (
    <>
      {' '}
      <Link
        tabIndex={messageFocusedTabIndex}
        targetBlank
        variant={LinkVariant.PRIMARY}
        href={config.URL.SUPPORT.OFFLINE_BACKEND}
        data-uie-name="go-offline-backend"
        css={backendErrorLink}
      >
        {t('offlineBackendLearnMore')}
      </Link>
    </>
  );

  return (
    <>
      <div className="message-header">
        <div className="message-header-icon message-header-icon--svg">
          <div className="svg-red">
            <Icon.Info />
          </div>
        </div>
        <div
          className="message-header-label"
          data-uie-name="element-message-failed-to-add-users"
          data-uie-value={total <= 1 ? '1-user-not-added' : 'multi-users-not-added'}
        >
          {total <= 1 && (
            <p data-uie-name="1-user-not-added-details" data-uie-value={users[0].id}>
              <span
                css={warning}
                dangerouslySetInnerHTML={{
                  __html: t(`failedToAddParticipantSingular${errorMessageType[message.reason]}`, {
                    name: getUserName(users[0]),
                    domain: users[0].domain,
                  }),
                }}
              />
              {learnMore}
            </p>
          )}
          {total > 1 && (
            <p
              css={warning}
              dangerouslySetInnerHTML={{
                __html: t(`failedToAddParticipantsPlural`, {total: total.toString()}),
              }}
            />
          )}
        </div>
        <p className="message-body-actions">
          <MessageTime
            timestamp={timestamp}
            data-uie-uid={message.id}
            data-uie-name="item-message-failed-to-add-users-timestamp"
          />
        </p>
      </div>
      <div className="message-body" css={{flexDirection: 'column'}}>
        {isOpen && (
          <MessageDetails users={users} reason={message.reason} domains={users.map(user => user.domain)}>
            {learnMore}
          </MessageDetails>
        )}

        {total > 1 && (
          <div>
            <Button
              tabIndex={messageFocusedTabIndex}
              data-uie-name="toggle-failed-to-add-users"
              type="button"
              variant={ButtonVariant.TERTIARY}
              onClick={() => setIsOpen(state => !state)}
              style={{marginTop: 4}}
            >
              {isOpen ? t('messageFailedToSendHideDetails') : t('messageFailedToSendShowDetails')}
            </Button>
          </div>
        )}
      </div>
    </>
  );
};

export {FailedToAddUsersMessage};

import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { RoutedLink, SyntaxHighlighter } from '@storybook/components';

import { createElement } from 'react-syntax-highlighter';
import { EVENT_ID } from './events';

const styles = {
  story: {
    display: 'block',
    textDecoration: 'none',
  },
  selectedStory: {
    backgroundColor: 'rgba(255, 242, 60, 0.2)',
  },
  panel: {
    width: '100%',
  },
};

const areLocationsEqual = (a, b) =>
  a.startLoc.line === b.startLoc.line &&
  a.startLoc.col === b.startLoc.col &&
  a.endLoc.line === b.endLoc.line &&
  a.endLoc.col === b.endLoc.col;

const getLocationKeys = locationsMap =>
  locationsMap
    ? Array.from(Object.keys(locationsMap)).sort(
        (key1, key2) => locationsMap[key1].startLoc.line - locationsMap[key2].startLoc.line
      )
    : [];

export default class StoryPanel extends Component {
  state = { source: 'loading source...' };

  componentDidMount() {
    this.mounted = true;
    const { channel } = this.props;

    channel.on(EVENT_ID, this.listener);
  }

  componentDidUpdate() {
    if (this.selectedStoryRef) {
      this.selectedStoryRef.scrollIntoView();
    }
  }

  componentWillUnmount() {
    const { channel } = this.props;

    channel.removeListener(EVENT_ID, this.listener);
  }

  setSelectedStoryRef = ref => {
    this.selectedStoryRef = ref;
  };

  listener = params => {
    if (params.source) {
      this.changeFocus(params);
    } else if (params.newSource && params.location) {
      this.updateSource(params);
    }
  };

  updateSource = ({ newSource }) => {
    const {
      source,
      currentLocation: {
        startLoc: { line: startLocLine, col: startLocCol },
        endLoc: { line: endLocLine, col: endLocCol },
      },
    } = this.state;
    const sourceLines = source.split('\n');
    const newFileSource =
      sourceLines.slice(0, Math.max(0, startLocLine - 2)).join('\n') +
      (startLocLine === 0 ? '' : '\n') +
      sourceLines[startLocLine - 1].substring(0, startLocCol) +
      newSource +
      sourceLines[endLocLine - 1].substring(endLocCol) +
      sourceLines.slice(Math.min(sourceLines.length - 1, endLocLine));

    const newEndLocLine = startLocLine + newSource.split('\n').length - 1;
    const newEndLocCol = newSource.split('\n').slice(-1).length;

    this.setState({
      source: newFileSource,
      currentLocation: {
        startLoc: { col: startLocCol, line: startLocLine },
        endLoc: { col: newEndLocCol, line: newEndLocLine },
      },
    });
  };

  changeFocus = ({ source, currentLocation, locationsMap }) => {
    const locationsKeys = getLocationKeys(locationsMap);

    this.setState({
      source,
      currentLocation,
      locationsMap,
      locationsKeys,
    });
  };

  clickOnStory = (kind, story) => {
    const { api } = this.props;

    if (kind && story) {
      api.selectStory(kind, story);
    }
  };

  createPart = (rows, stylesheet, useInlineStyles) =>
    rows.map((node, i) =>
      createElement({
        node,
        stylesheet,
        useInlineStyles,
        key: `code-segement${i}`,
      })
    );

  onEdit = (e, newSource, location) => {
    const { channel } = this.props;
    channel.emit(EVENT_ID, { newSource, location });
  };

  createStoryPart = (rows, stylesheet, useInlineStyles, location, kindStory) => {
    const { currentLocation } = this.state;
    const first = location.startLoc.line - 1;
    const last = location.endLoc.line;

    const storyRows = rows.slice(first, last);
    const story = this.createPart(storyRows, stylesheet, useInlineStyles);
    const storyKey = `${first}-${last}`;

    if (areLocationsEqual(location, currentLocation)) {
      return (
        <div
          key={storyKey}
          ref={this.setSelectedStoryRef}
          style={styles.selectedStory}
          contentEditable
          role="textbox"
          tabIndex="0"
          onKeyUp={event => this.onEdit(event, event.currentTarget.innerText, location)}
        >
          {story}
        </div>
      );
    }

    const [selectedKind, selectedStory] = kindStory.split('@');
    const url = `/?selectedKind=${selectedKind}&selectedStory=${selectedStory}`;

    return (
      <RoutedLink
        href={url}
        key={storyKey}
        onClick={() => this.clickOnStory(selectedKind, selectedStory)}
        style={styles.story}
      >
        {story}
      </RoutedLink>
    );
  };

  createParts = (rows, stylesheet, useInlineStyles) => {
    const { locationsMap, locationsKeys } = this.state;

    const parts = [];
    let lastRow = 0;

    locationsKeys.forEach(key => {
      const location = locationsMap[key];
      const first = location.startLoc.line - 1;
      const last = location.endLoc.line;

      const start = this.createPart(rows.slice(lastRow, first), stylesheet, useInlineStyles);
      const storyPart = this.createStoryPart(rows, stylesheet, useInlineStyles, location, key);

      parts.push(start);
      parts.push(storyPart);

      lastRow = last;
    });

    const lastPart = this.createPart(rows.slice(lastRow), stylesheet, useInlineStyles);

    parts.push(lastPart);

    return parts;
  };

  lineRenderer = ({ rows, stylesheet, useInlineStyles }) => {
    const { locationsMap, locationsKeys } = this.state;

    // because of the usage of lineRenderer, all lines will be wrapped in a span
    // these spans will recieve all classes on them for some reason
    // which makes colours casecade incorrectly
    // this removed that list of classnames
    const myrows = rows.map(({ properties, ...rest }) => ({
      ...rest,
      properties: { className: [] },
    }));

    if (!locationsMap || !locationsKeys.length) {
      return this.createPart(myrows, stylesheet, useInlineStyles);
    }

    const parts = this.createParts(myrows, stylesheet, useInlineStyles);

    return <span>{parts}</span>;
  };

  render() {
    const { active } = this.props;
    const { source } = this.state;

    return active ? (
      <SyntaxHighlighter
        language="jsx"
        showLineNumbers="true"
        renderer={this.lineRenderer}
        copyable={false}
        padded
      >
        {source}
      </SyntaxHighlighter>
    ) : null;
  }
}

StoryPanel.propTypes = {
  active: PropTypes.bool.isRequired,
  api: PropTypes.shape({
    selectStory: PropTypes.func.isRequired,
  }).isRequired,
  channel: PropTypes.shape({
    emit: PropTypes.func,
    on: PropTypes.func,
    removeListener: PropTypes.func,
  }).isRequired,
};

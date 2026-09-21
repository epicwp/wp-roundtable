<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests\Html;

use EpicWP\Roundtable\Html\HtmlToMarkdown;
use PHPUnit\Framework\TestCase as PHPUnitTestCase;

final class HtmlToMarkdownTest extends PHPUnitTestCase
{
    public function test_plain_text_without_any_html_passes_through_unchanged(): void
    {
        $text = "Just a plain sentence, with punctuation! And a second line? Maybe.";

        self::assertSame($text, HtmlToMarkdown::convert($text));
    }

    public function test_plain_text_is_only_trimmed(): void
    {
        self::assertSame('hello world', HtmlToMarkdown::convert('  hello world  '));
    }

    public function test_empty_string_converts_to_empty_string(): void
    {
        self::assertSame('', HtmlToMarkdown::convert(''));
        self::assertSame('', HtmlToMarkdown::convert('   '));
    }

    public function test_paragraphs_become_blank_line_separated_blocks(): void
    {
        $html = '<p>First paragraph.</p><p>Second paragraph.</p>';

        self::assertSame("First paragraph.\n\nSecond paragraph.", HtmlToMarkdown::convert($html));
    }

    public function test_br_becomes_a_hard_line_break(): void
    {
        $html = '<p>Line one<br>Line two</p>';

        self::assertSame("Line one  \nLine two", HtmlToMarkdown::convert($html));
    }

    public function test_strong_and_b_become_double_asterisks(): void
    {
        self::assertSame('**bold**', HtmlToMarkdown::convert('<strong>bold</strong>'));
        self::assertSame('**bold**', HtmlToMarkdown::convert('<b>bold</b>'));
    }

    public function test_em_and_i_become_single_asterisks(): void
    {
        self::assertSame('*italic*', HtmlToMarkdown::convert('<em>italic</em>'));
        self::assertSame('*italic*', HtmlToMarkdown::convert('<i>italic</i>'));
    }

    public function test_unordered_list_becomes_dash_items(): void
    {
        $html = '<ul><li>One</li><li>Two</li></ul>';

        self::assertSame("- One\n- Two", HtmlToMarkdown::convert($html));
    }

    public function test_ordered_list_becomes_numbered_items(): void
    {
        $html = '<ol><li>One</li><li>Two</li></ol>';

        self::assertSame("1. One\n2. Two", HtmlToMarkdown::convert($html));
    }

    public function test_nested_list_is_indented(): void
    {
        $html = '<ul><li>Parent<ul><li>Child one</li><li>Child two</li></ul></li><li>Sibling</li></ul>';

        self::assertSame(
            "- Parent\n  - Child one\n  - Child two\n- Sibling",
            HtmlToMarkdown::convert($html),
        );
    }

    public function test_nested_ordered_inside_unordered_is_indented_and_numbered(): void
    {
        $html = '<ul><li>Parent<ol><li>Step one</li><li>Step two</li></ol></li></ul>';

        self::assertSame(
            "- Parent\n  1. Step one\n  2. Step two",
            HtmlToMarkdown::convert($html),
        );
    }

    public function test_link_with_http_href_becomes_a_markdown_link(): void
    {
        $html = '<a href="https://example.com/page">Example</a>';

        self::assertSame('[Example](https://example.com/page)', HtmlToMarkdown::convert($html));
    }

    public function test_link_with_mailto_href_becomes_a_markdown_link(): void
    {
        $html = '<a href="mailto:a@example.com">Email us</a>';

        self::assertSame('[Email us](mailto:a@example.com)', HtmlToMarkdown::convert($html));
    }

    public function test_link_with_disallowed_scheme_keeps_text_only(): void
    {
        $html = '<a href="javascript:alert(1)">Click me</a>';

        self::assertSame('Click me', HtmlToMarkdown::convert($html));
    }

    public function test_link_without_href_keeps_text_only(): void
    {
        self::assertSame('Click me', HtmlToMarkdown::convert('<a>Click me</a>'));
    }

    public function test_link_attributes_other_than_href_are_dropped(): void
    {
        $html = '<a href="https://example.com" onclick="evil()" target="_blank">Example</a>';

        self::assertSame('[Example](https://example.com)', HtmlToMarkdown::convert($html));
    }

    public function test_code_becomes_backticks(): void
    {
        self::assertSame('`$x = 1;`', HtmlToMarkdown::convert('<code>$x = 1;</code>'));
    }

    public function test_pre_becomes_a_fenced_code_block(): void
    {
        $html = "<pre>function f() {\n  return 1;\n}</pre>";

        self::assertSame("```\nfunction f() {\n  return 1;\n}\n```", HtmlToMarkdown::convert($html));
    }

    public function test_pre_content_is_not_reprocessed_as_markdown(): void
    {
        $html = '<pre><code>**not bold**</code></pre>';

        self::assertSame("```\n**not bold**\n```", HtmlToMarkdown::convert($html));
    }

    public function test_h3_and_h4_become_atx_headings(): void
    {
        self::assertSame('### Heading', HtmlToMarkdown::convert('<h3>Heading</h3>'));
        self::assertSame('#### Heading', HtmlToMarkdown::convert('<h4>Heading</h4>'));
    }

    public function test_blockquote_prefixes_every_line(): void
    {
        $html = '<blockquote><p>Quoted line one.</p><p>Quoted line two.</p></blockquote>';

        self::assertSame("> Quoted line one.\n>\n> Quoted line two.", HtmlToMarkdown::convert($html));
    }

    public function test_disallowed_tags_are_unwrapped_but_keep_their_text(): void
    {
        self::assertSame('Hello world', HtmlToMarkdown::convert('<div><span>Hello</span> world</div>'));
        self::assertSame('A cell', HtmlToMarkdown::convert('<table><tr><td>A cell</td></tr></table>'));
    }

    public function test_script_tag_and_its_content_are_stripped_entirely(): void
    {
        self::assertSame('Before After', HtmlToMarkdown::convert('Before<script>alert(1);</script> After'));
    }

    public function test_style_tag_and_its_content_are_stripped_entirely(): void
    {
        self::assertSame('Before After', HtmlToMarkdown::convert('Before<style>body{color:red}</style> After'));
    }

    public function test_img_tag_is_stripped(): void
    {
        self::assertSame('Before After', HtmlToMarkdown::convert('Before<img src="x.png" alt="x"> After'));
    }

    public function test_iframe_tag_is_stripped(): void
    {
        self::assertSame(
            'Before After',
            HtmlToMarkdown::convert('Before<iframe src="https://evil.example"></iframe> After'),
        );
    }

    public function test_entities_are_decoded(): void
    {
        self::assertSame('Ben & Jerry\'s "ice cream"', HtmlToMarkdown::convert('Ben &amp; Jerry&#39;s &quot;ice cream&quot;'));
    }

    public function test_inline_elements_keep_the_word_separating_space_between_them(): void
    {
        self::assertSame('**Hello** *world*', HtmlToMarkdown::convert('<b>Hello</b> <i>world</i>'));
    }

    public function test_text_around_an_inline_element_keeps_its_spacing(): void
    {
        self::assertSame('foo **bar** baz', HtmlToMarkdown::convert('foo <strong>bar</strong> baz'));
    }

    public function test_whitespace_and_blank_lines_are_normalized(): void
    {
        $html = "<p>Hello   \n   world</p>\n\n\n<p>Second</p>";

        self::assertSame("Hello world\n\nSecond", HtmlToMarkdown::convert($html));
    }

    public function test_malformed_html_never_fatals_and_falls_back_to_plain_text(): void
    {
        $html = '<p><strong>Unclosed <em>tags <a href="https://example.com">here';

        $result = HtmlToMarkdown::convert($html);

        self::assertIsString($result);
        self::assertStringContainsString('Unclosed', $result);
        self::assertStringContainsString('tags', $result);
        self::assertStringContainsString('here', $result);
    }

    public function test_deeply_broken_markup_never_fatals(): void
    {
        $html = '<<<>>><p><<div<<<script>alert(1)</script<<<';

        $result = HtmlToMarkdown::convert($html);

        self::assertIsString($result);
    }

    // -- Markdown-escaping of plain-text runs (the "what you typed is what you see" contract) --

    public function test_leading_dash_in_plain_text_is_escaped_not_a_bullet(): void
    {
        $html = '<p>- I tried updating and it broke my site.</p>';

        self::assertSame(
            '\\- I tried updating and it broke my site.',
            HtmlToMarkdown::convert($html),
        );
    }

    public function test_leading_heading_marker_in_plain_text_is_escaped_not_a_heading(): void
    {
        $html = '<p># 1 priority</p>';

        self::assertSame('\\# 1 priority', HtmlToMarkdown::convert($html));
    }

    public function test_leading_ordered_marker_in_plain_text_is_escaped_not_a_list(): void
    {
        $html = '<p>1. First try clearing cache.</p>';

        self::assertSame('1\\. First try clearing cache.', HtmlToMarkdown::convert($html));
    }

    public function test_leading_ordered_marker_with_parenthesis_is_escaped(): void
    {
        self::assertSame('1\\) First step.', HtmlToMarkdown::convert('<p>1) First step.</p>'));
    }

    public function test_leading_plus_marker_in_plain_text_is_escaped(): void
    {
        self::assertSame('\\+1 to that', HtmlToMarkdown::convert('<p>+1 to that</p>'));
    }

    public function test_leading_blockquote_marker_in_plain_text_is_escaped(): void
    {
        self::assertSame('\\> not a quote', HtmlToMarkdown::convert('<p>&gt; not a quote</p>'));
    }

    public function test_inline_backtick_in_plain_text_is_escaped_not_code(): void
    {
        $html = '<p>Run `npm install` first.</p>';

        self::assertSame('Run \\`npm install\\` first.', HtmlToMarkdown::convert($html));
    }

    public function test_inline_asterisk_and_underscore_in_plain_text_are_escaped(): void
    {
        self::assertSame(
            '5 \\* 3 and file\\_name.txt',
            HtmlToMarkdown::convert('<p>5 * 3 and file_name.txt</p>'),
        );
    }

    public function test_square_brackets_in_plain_text_are_escaped(): void
    {
        self::assertSame('See \\[note 1\\] below.', HtmlToMarkdown::convert('<p>See [note 1] below.</p>'));
    }

    public function test_backslash_in_plain_text_is_escaped(): void
    {
        self::assertSame('C:\\\\Users\\\\me', HtmlToMarkdown::convert('<p>C:\\Users\\me</p>'));
    }

    public function test_a_non_leading_dash_is_not_escaped(): void
    {
        self::assertSame('well-known issue', HtmlToMarkdown::convert('<p>well-known issue</p>'));
    }

    public function test_fast_path_without_any_html_also_escapes_markdown_significant_text(): void
    {
        self::assertSame(
            '\\- I tried updating and it broke my site.',
            HtmlToMarkdown::convert('- I tried updating and it broke my site.'),
        );
    }

    public function test_code_tag_content_is_not_escaped(): void
    {
        $html = '<p>Run <code>`npm install`</code> first.</p>';

        self::assertSame('Run ``npm install`` first.', HtmlToMarkdown::convert($html));
    }

    public function test_pre_tag_content_is_not_escaped(): void
    {
        $html = "<pre>- item\n# heading\n1. step\n*star*</pre>";

        self::assertSame(
            "```\n- item\n# heading\n1. step\n*star*\n```",
            HtmlToMarkdown::convert($html),
        );
    }

    public function test_malformed_html_fallback_also_escapes(): void
    {
        // Unclosed tag forces the DOM's best-effort path; the leading dash in the
        // recovered text must still be escaped, not left free to render as a bullet.
        $html = '<p><strong>- unclosed bold, still starts with a dash';

        $result = HtmlToMarkdown::convert($html);

        self::assertStringContainsString('\\-', $result);
    }

    public function test_toolbar_bold_list_and_link_output_still_convert_normally(): void
    {
        self::assertSame('**bold**', HtmlToMarkdown::convert('<strong>bold</strong>'));
        self::assertSame("- One\n- Two", HtmlToMarkdown::convert('<ul><li>One</li><li>Two</li></ul>'));
        self::assertSame(
            '[Example](https://example.com/page)',
            HtmlToMarkdown::convert('<a href="https://example.com/page">Example</a>'),
        );
    }

    public function test_a_list_items_own_text_starting_with_a_dash_is_still_escaped(): void
    {
        $html = '<ul><li>- not a nested list, just a dash</li></ul>';

        self::assertSame('- \\- not a nested list, just a dash', HtmlToMarkdown::convert($html));
    }
}
